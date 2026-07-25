//! Feature-gated local SenseVoice inference service.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex as StdMutex,
};
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use sherpa_onnx::{OfflineRecognizer, OfflineRecognizerConfig, OfflineSenseVoiceModelConfig};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::local_asr::{
    is_valid_local_model_id, LocalAsrAppendAudioChunkRequest, LocalAsrAppendAudioChunkResponse,
    LocalAsrError, LocalAsrErrorCode, LocalAsrInputSession, LocalAsrSessionRequest,
    LocalAsrStartInputSessionRequest, LocalAsrTranscriptionResult, VoiceInputConfig,
};

const DEFAULT_SAMPLE_RATE: u32 = 16_000;
const MAX_RECORDING_SECONDS: u32 = 300;
const MAX_CHUNK_SECONDS: usize = 2;
const SESSION_EXPIRY_GRACE_SECONDS: u64 = 30;
const MAX_PCM_BYTES: usize = DEFAULT_SAMPLE_RATE as usize * MAX_RECORDING_SECONDS as usize * 2;
const MAX_CHUNK_PCM_BYTES: usize = DEFAULT_SAMPLE_RATE as usize * MAX_CHUNK_SECONDS * 2;
const MAX_CHUNK_BASE64_BYTES: usize = MAX_CHUNK_PCM_BYTES.div_ceil(3) * 4;

trait LocalAsrRecognizer: Send + Sync {
    fn transcribe(
        &self,
        model_dir: &Path,
        pcm16_le: &[u8],
        sample_rate: u32,
        language: &str,
    ) -> Result<String, LocalAsrError>;
}

#[derive(Default)]
struct SenseVoiceRecognizer {
    cached: StdMutex<Option<CachedRecognizer>>,
}

struct CachedRecognizer {
    model_path: PathBuf,
    tokens_path: PathBuf,
    language: String,
    recognizer: OfflineRecognizer,
}

impl LocalAsrRecognizer for SenseVoiceRecognizer {
    fn transcribe(
        &self,
        model_dir: &Path,
        pcm16_le: &[u8],
        sample_rate: u32,
        language: &str,
    ) -> Result<String, LocalAsrError> {
        let samples = pcm16_le_to_f32(pcm16_le)?;
        if samples.is_empty() {
            return Err(error(
                LocalAsrErrorCode::EmptyAudio,
                "No speech audio was captured.",
                true,
            ));
        }

        let model_path = model_dir.join("model.int8.onnx");
        let tokens_path = model_dir.join("tokens.txt");
        ensure_model_files(model_dir)?;
        let mut cache = self.cached.lock().map_err(|_| {
            error(
                LocalAsrErrorCode::TranscriptionFailed,
                "The speech recognizer cache is unavailable.",
                true,
            )
        })?;
        let reload = cache.as_ref().is_none_or(|cached| {
            cached.model_path != model_path
                || cached.tokens_path != tokens_path
                || cached.language != language
        });
        if reload {
            let mut config = OfflineRecognizerConfig::default();
            config.model_config.sense_voice = OfflineSenseVoiceModelConfig {
                model: Some(model_path.to_string_lossy().into_owned()),
                language: Some(language.to_string()),
                use_itn: true,
            };
            config.model_config.tokens = Some(tokens_path.to_string_lossy().into_owned());
            let recognizer = OfflineRecognizer::create(&config).ok_or_else(|| {
                error(
                    LocalAsrErrorCode::TranscriptionFailed,
                    "Failed to initialize the local speech recognizer.",
                    true,
                )
            })?;
            *cache = Some(CachedRecognizer {
                model_path,
                tokens_path,
                language: language.to_string(),
                recognizer,
            });
        }

        let recognizer = &cache
            .as_ref()
            .expect("recognizer cache must be initialized")
            .recognizer;
        let stream = recognizer.create_stream();
        stream.accept_waveform(sample_rate as i32, &samples);
        recognizer.decode(&stream);
        Ok(stream
            .get_result()
            .ok_or_else(|| {
                error(
                    LocalAsrErrorCode::TranscriptionFailed,
                    "Failed to read the local speech transcription.",
                    true,
                )
            })?
            .text
            .trim()
            .to_string())
    }
}

struct SessionState {
    session: LocalAsrInputSession,
    model_dir: PathBuf,
    pcm16_le: Vec<u8>,
    expires_at: Instant,
}

#[derive(Clone)]
pub struct LocalAsrService {
    recognizer: Arc<dyn LocalAsrRecognizer>,
    sessions: Arc<Mutex<HashMap<String, SessionState>>>,
    inferences: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl Default for LocalAsrService {
    fn default() -> Self {
        Self::new()
    }
}

impl LocalAsrService {
    pub fn new() -> Self {
        Self {
            recognizer: Arc::new(SenseVoiceRecognizer::default()),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            inferences: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start_input_session(
        &self,
        config: &VoiceInputConfig,
        request: LocalAsrStartInputSessionRequest,
    ) -> Result<LocalAsrInputSession, LocalAsrError> {
        if !config.enabled {
            return Err(error(
                LocalAsrErrorCode::Disabled,
                "Local voice input is disabled.",
                false,
            ));
        }
        if config.provider != "local" {
            return Err(error(
                LocalAsrErrorCode::UnsupportedProvider,
                "Only the local ASR provider is supported.",
                false,
            ));
        }
        if !is_valid_local_model_id(config.model_id.trim()) {
            return Err(error(
                LocalAsrErrorCode::InvalidModelId,
                "The ASR model id must be one local directory name.",
                false,
            ));
        }
        let model_dir = Path::new(config.model_directory.trim()).join(config.model_id.trim());
        ensure_model_files(&model_dir)?;

        let sample_rate = request.sample_rate.unwrap_or(DEFAULT_SAMPLE_RATE);
        if sample_rate != DEFAULT_SAMPLE_RATE {
            return Err(error(
                LocalAsrErrorCode::InvalidAudio,
                "Local ASR accepts 16000 Hz mono PCM16 audio only.",
                false,
            ));
        }
        let configured_limit = config.max_recording_seconds.clamp(1, MAX_RECORDING_SECONDS);
        let max_recording_seconds = request
            .max_recording_seconds
            .unwrap_or(configured_limit)
            .clamp(1, configured_limit);
        let language = request
            .language
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| config.default_language.clone());

        let mut sessions = self.sessions.lock().await;
        remove_expired_sessions(&mut sessions);
        if !sessions.is_empty() {
            return Err(error(
                LocalAsrErrorCode::Busy,
                "Another local speech input session is active.",
                true,
            ));
        }
        let session = LocalAsrInputSession {
            session_id: Uuid::new_v4().to_string(),
            model_id: config.model_id.clone(),
            language,
            sample_rate,
            max_recording_seconds,
        };
        sessions.insert(
            session.session_id.clone(),
            SessionState {
                session: session.clone(),
                model_dir,
                pcm16_le: Vec::new(),
                expires_at: Instant::now()
                    + Duration::from_secs(
                        max_recording_seconds as u64 + SESSION_EXPIRY_GRACE_SECONDS,
                    ),
            },
        );
        Ok(session)
    }

    pub async fn append_audio_chunk(
        &self,
        request: LocalAsrAppendAudioChunkRequest,
    ) -> Result<LocalAsrAppendAudioChunkResponse, LocalAsrError> {
        if request.pcm16_base64.len() > MAX_CHUNK_BASE64_BYTES {
            return Err(error(
                LocalAsrErrorCode::RecordingLimitReached,
                "The audio chunk exceeds the 2-second local IPC limit.",
                false,
            ));
        }
        let bytes = BASE64_STANDARD
            .decode(request.pcm16_base64.as_bytes())
            .map_err(|_| {
                error(
                    LocalAsrErrorCode::InvalidAudio,
                    "The audio chunk is not valid base64.",
                    false,
                )
            })?;
        if bytes.len() % 2 != 0 {
            return Err(error(
                LocalAsrErrorCode::InvalidAudio,
                "PCM16 audio chunks must contain complete samples.",
                false,
            ));
        }

        let mut sessions = self.sessions.lock().await;
        remove_expired_sessions(&mut sessions);
        let state = sessions.get_mut(&request.session_id).ok_or_else(|| {
            error(
                LocalAsrErrorCode::SessionNotFound,
                "The local speech input session was not found.",
                false,
            )
        })?;
        let max_bytes =
            (state.session.sample_rate as u64 * state.session.max_recording_seconds as u64 * 2)
                .min(MAX_PCM_BYTES as u64);
        let remaining = max_bytes.saturating_sub(state.pcm16_le.len() as u64);
        let accepted = bytes.len().min(remaining as usize) & !1;
        state.pcm16_le.extend_from_slice(&bytes[..accepted]);
        let received_bytes = state.pcm16_le.len() as u64;
        Ok(LocalAsrAppendAudioChunkResponse {
            received_bytes,
            received_seconds: received_bytes as f64 / 2.0 / state.session.sample_rate as f64,
            limit_reached: received_bytes >= max_bytes,
        })
    }

    pub async fn finish_input_session(
        &self,
        request: LocalAsrSessionRequest,
    ) -> Result<LocalAsrTranscriptionResult, LocalAsrError> {
        let session_id = request.session_id;
        let cancelled = Arc::new(AtomicBool::new(false));
        let state = {
            let mut sessions = self.sessions.lock().await;
            let state = sessions.remove(&session_id).ok_or_else(|| {
                error(
                    LocalAsrErrorCode::SessionNotFound,
                    "The local speech input session was not found.",
                    false,
                )
            })?;
            if state.pcm16_le.is_empty() {
                return Err(error(
                    LocalAsrErrorCode::EmptyAudio,
                    "No speech audio was captured.",
                    true,
                ));
            }
            self.inferences
                .lock()
                .await
                .insert(session_id.clone(), Arc::clone(&cancelled));
            state
        };

        let started = Instant::now();
        let recognizer = Arc::clone(&self.recognizer);
        let SessionState {
            session,
            model_dir,
            pcm16_le,
            ..
        } = state;
        let sample_rate = session.sample_rate;
        let language = session.language.clone();
        let result_language = language.clone();
        let audio_duration_seconds = pcm16_le.len() as f64 / 2.0 / sample_rate as f64;
        let transcription = tokio::task::spawn_blocking(move || {
            recognizer.transcribe(&model_dir, &pcm16_le, sample_rate, &language)
        })
        .await
        .map_err(|_| {
            error(
                LocalAsrErrorCode::TranscriptionFailed,
                "The local speech transcription task failed.",
                true,
            )
        });
        self.inferences.lock().await.remove(&session_id);
        if cancelled.load(Ordering::Acquire) {
            return Err(error(
                LocalAsrErrorCode::Cancelled,
                "The local speech transcription was cancelled.",
                false,
            ));
        }
        let text = transcription??;

        Ok(LocalAsrTranscriptionResult {
            text,
            language: result_language,
            duration_ms: started.elapsed().as_millis() as u64,
            audio_duration_seconds,
        })
    }

    pub async fn cancel_input_session(
        &self,
        request: LocalAsrSessionRequest,
    ) -> Result<(), LocalAsrError> {
        let mut sessions = self.sessions.lock().await;
        sessions.remove(&request.session_id);
        if let Some(cancelled) = self.inferences.lock().await.remove(&request.session_id) {
            cancelled.store(true, Ordering::Release);
        }
        drop(sessions);
        Ok(())
    }
}

fn remove_expired_sessions(sessions: &mut HashMap<String, SessionState>) {
    let now = Instant::now();
    sessions.retain(|_, state| state.expires_at > now);
}

fn ensure_model_files(model_dir: &Path) -> Result<(), LocalAsrError> {
    if !model_dir.is_dir() {
        return Err(error(
            LocalAsrErrorCode::ModelMissing,
            "The selected local ASR model directory does not exist.",
            false,
        ));
    }
    if !model_dir.join("model.int8.onnx").is_file() || !model_dir.join("tokens.txt").is_file() {
        return Err(error(
            LocalAsrErrorCode::ModelCorrupt,
            "The SenseVoice model must contain model.int8.onnx and tokens.txt.",
            false,
        ));
    }
    Ok(())
}

fn pcm16_le_to_f32(bytes: &[u8]) -> Result<Vec<f32>, LocalAsrError> {
    if bytes.len() % 2 != 0 {
        return Err(error(
            LocalAsrErrorCode::InvalidAudio,
            "PCM16 audio must contain complete samples.",
            false,
        ));
    }
    Ok(bytes
        .chunks_exact(2)
        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]) as f32 / i16::MAX as f32)
        .collect())
}

fn error(code: LocalAsrErrorCode, message: impl Into<String>, retryable: bool) -> LocalAsrError {
    LocalAsrError {
        code,
        message: message.into(),
        retryable,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct FakeRecognizer;

    impl LocalAsrRecognizer for FakeRecognizer {
        fn transcribe(
            &self,
            _model_dir: &Path,
            _pcm16_le: &[u8],
            _sample_rate: u32,
            _language: &str,
        ) -> Result<String, LocalAsrError> {
            Ok("hello locally".to_string())
        }
    }

    fn test_service() -> LocalAsrService {
        LocalAsrService {
            recognizer: Arc::new(FakeRecognizer),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            inferences: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn fixture_config(root: &Path) -> VoiceInputConfig {
        let model_dir = root.join("sensevoice-small-int8");
        std::fs::create_dir_all(&model_dir).unwrap();
        std::fs::write(model_dir.join("model.int8.onnx"), b"fixture").unwrap();
        std::fs::write(model_dir.join("tokens.txt"), b"fixture").unwrap();
        VoiceInputConfig {
            enabled: true,
            model_directory: root.to_string_lossy().into_owned(),
            ..VoiceInputConfig::default()
        }
    }

    #[tokio::test]
    async fn bounds_audio_and_transcribes_without_writing_audio_to_disk() {
        let root = std::env::temp_dir().join(format!("void-local-asr-engine-{}", Uuid::new_v4()));
        let config = fixture_config(&root);
        let service = test_service();
        let session = service
            .start_input_session(
                &config,
                LocalAsrStartInputSessionRequest {
                    language: None,
                    sample_rate: Some(DEFAULT_SAMPLE_RATE),
                    max_recording_seconds: Some(1),
                },
            )
            .await
            .unwrap();
        let response = service
            .append_audio_chunk(LocalAsrAppendAudioChunkRequest {
                session_id: session.session_id.clone(),
                pcm16_base64: BASE64_STANDARD.encode(vec![1_u8; 32_002]),
            })
            .await
            .unwrap();
        assert_eq!(response.received_bytes, 32_000);
        assert!(response.limit_reached);

        let result = service
            .finish_input_session(LocalAsrSessionRequest {
                session_id: session.session_id,
            })
            .await
            .unwrap();
        assert_eq!(result.text, "hello locally");
        assert_eq!(result.audio_duration_seconds, 1.0);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn rejects_a_second_active_session_and_cancel_is_idempotent() {
        let root = std::env::temp_dir().join(format!("void-local-asr-busy-{}", Uuid::new_v4()));
        let config = fixture_config(&root);
        let service = test_service();
        let session = service
            .start_input_session(
                &config,
                LocalAsrStartInputSessionRequest {
                    language: None,
                    sample_rate: None,
                    max_recording_seconds: None,
                },
            )
            .await
            .unwrap();
        let second = service
            .start_input_session(
                &config,
                LocalAsrStartInputSessionRequest {
                    language: None,
                    sample_rate: None,
                    max_recording_seconds: None,
                },
            )
            .await
            .unwrap_err();
        assert_eq!(second.code, LocalAsrErrorCode::Busy);

        let request = LocalAsrSessionRequest {
            session_id: session.session_id,
        };
        service.cancel_input_session(request.clone()).await.unwrap();
        service.cancel_input_session(request).await.unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn rejects_model_ids_that_escape_the_configured_directory() {
        let root = std::env::temp_dir().join(format!("void-local-asr-path-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let config = VoiceInputConfig {
            enabled: true,
            model_id: "../outside".to_string(),
            model_directory: root.to_string_lossy().into_owned(),
            ..VoiceInputConfig::default()
        };
        let failure = test_service()
            .start_input_session(
                &config,
                LocalAsrStartInputSessionRequest {
                    language: None,
                    sample_rate: None,
                    max_recording_seconds: None,
                },
            )
            .await
            .unwrap_err();

        assert_eq!(failure.code, LocalAsrErrorCode::InvalidModelId);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn rejects_oversized_base64_before_decoding() {
        let service = test_service();
        let failure = service
            .append_audio_chunk(LocalAsrAppendAudioChunkRequest {
                session_id: "missing".to_string(),
                pcm16_base64: "A".repeat(MAX_CHUNK_BASE64_BYTES + 1),
            })
            .await
            .unwrap_err();

        assert_eq!(failure.code, LocalAsrErrorCode::RecordingLimitReached);
    }

    #[tokio::test]
    async fn expired_sessions_do_not_leave_the_service_busy() {
        let root = std::env::temp_dir().join(format!("void-local-asr-expiry-{}", Uuid::new_v4()));
        let config = fixture_config(&root);
        let service = test_service();
        let first = service
            .start_input_session(
                &config,
                LocalAsrStartInputSessionRequest {
                    language: None,
                    sample_rate: None,
                    max_recording_seconds: None,
                },
            )
            .await
            .unwrap();
        service
            .sessions
            .lock()
            .await
            .get_mut(&first.session_id)
            .unwrap()
            .expires_at = Instant::now() - Duration::from_secs(1);

        let second = service
            .start_input_session(
                &config,
                LocalAsrStartInputSessionRequest {
                    language: None,
                    sample_rate: None,
                    max_recording_seconds: None,
                },
            )
            .await
            .unwrap();
        assert_ne!(first.session_id, second.session_id);
        std::fs::remove_dir_all(root).unwrap();
    }
}
