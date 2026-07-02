pub const APIMART_BASE_URL: &str = "https://api.apimart.ai";
pub const DEFAULT_IMAGE_MODEL: &str = "gpt-image-2";
pub const DEFAULT_VIDEO_MODEL: &str = "Omni-Flash-Ext";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MediaValidationError {
    UnsupportedModel(String),
    UnsupportedParameter {
        model: String,
        parameter: String,
    },
    InvalidValue {
        model: String,
        parameter: String,
        value: String,
        allowed: Vec<&'static str>,
    },
    TooManyInputs {
        model: String,
        parameter: String,
        max: usize,
        actual: usize,
    },
    UnsupportedInputCount {
        model: String,
        parameter: String,
        allowed: Vec<usize>,
        actual: usize,
    },
    ConflictingInputs {
        model: String,
        parameters: Vec<&'static str>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ImageGenerationRequest {
    pub model: Option<String>,
    pub size: Option<String>,
    pub resolution: Option<String>,
    pub image_urls: Vec<String>,
    pub n: Option<u8>,
    pub official_fallback: Option<bool>,
    pub google_search: Option<bool>,
    pub google_image_search: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedImageGenerationRequest {
    pub model: String,
}

pub fn validate_image_generation(
    request: &ImageGenerationRequest,
) -> Result<ResolvedImageGenerationRequest, MediaValidationError> {
    let model = request
        .model
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(DEFAULT_IMAGE_MODEL);
    let capability = image_capability(model)
        .ok_or_else(|| MediaValidationError::UnsupportedModel(model.to_string()))?;

    if let Some(size) = request.size.as_deref() {
        validate_allowed(model, "size", size, capability.sizes)?;
    }
    if let Some(resolution) = request.resolution.as_deref() {
        validate_allowed(model, "resolution", resolution, capability.resolutions)?;
    }
    if request.image_urls.len() > capability.max_image_urls {
        return Err(MediaValidationError::TooManyInputs {
            model: model.to_string(),
            parameter: "image_urls".to_string(),
            max: capability.max_image_urls,
            actual: request.image_urls.len(),
        });
    }
    if let Some(n) = request.n {
        if n < capability.n_min || n > capability.n_max {
            return Err(MediaValidationError::InvalidValue {
                model: model.to_string(),
                parameter: "n".to_string(),
                value: n.to_string(),
                allowed: (capability.n_min..=capability.n_max)
                    .map(|value| match value {
                        1 => "1",
                        2 => "2",
                        3 => "3",
                        4 => "4",
                        _ => "",
                    })
                    .filter(|value| !value.is_empty())
                    .collect(),
            });
        }
    }
    if capability.official_variant && request.official_fallback.is_some() {
        return Err(MediaValidationError::UnsupportedParameter {
            model: model.to_string(),
            parameter: "official_fallback".to_string(),
        });
    }
    if request.google_image_search == Some(true) && request.google_search != Some(true) {
        return Err(MediaValidationError::ConflictingInputs {
            model: model.to_string(),
            parameters: vec!["google_image_search", "google_search"],
        });
    }

    Ok(ResolvedImageGenerationRequest {
        model: model.to_string(),
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct VideoGenerationRequest {
    pub model: Option<String>,
    pub duration: Option<u8>,
    pub resolution: Option<String>,
    pub aspect_ratio: Option<String>,
    pub size: Option<String>,
    pub image_urls: Vec<String>,
    pub image_with_roles: Vec<String>,
    pub video_urls: Vec<String>,
    pub audio_urls: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedVideoGenerationRequest {
    pub model: String,
}

pub fn validate_video_generation(
    request: &VideoGenerationRequest,
) -> Result<ResolvedVideoGenerationRequest, MediaValidationError> {
    let model = request
        .model
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(DEFAULT_VIDEO_MODEL);
    let capability = video_capability(model)
        .ok_or_else(|| MediaValidationError::UnsupportedModel(model.to_string()))?;

    if let Some(duration) = request.duration {
        if !capability.durations.contains(&duration) {
            return Err(MediaValidationError::InvalidValue {
                model: model.to_string(),
                parameter: "duration".to_string(),
                value: duration.to_string(),
                allowed: capability.duration_labels(),
            });
        }
    }
    if let Some(resolution) = request.resolution.as_deref() {
        validate_allowed(model, "resolution", resolution, capability.resolutions)?;
    }
    if let Some(aspect_ratio) = request.aspect_ratio.as_deref() {
        validate_allowed(
            model,
            "aspect_ratio",
            aspect_ratio,
            capability.aspect_ratios,
        )?;
    }
    if let Some(size) = request.size.as_deref() {
        validate_allowed(model, "size", size, capability.sizes)?;
    }
    if let Some(allowed_counts) = capability.image_url_counts {
        if !allowed_counts.contains(&request.image_urls.len()) {
            return Err(MediaValidationError::UnsupportedInputCount {
                model: model.to_string(),
                parameter: "image_urls".to_string(),
                allowed: allowed_counts.to_vec(),
                actual: request.image_urls.len(),
            });
        }
    } else if request.image_urls.len() > capability.max_image_urls {
        return Err(MediaValidationError::TooManyInputs {
            model: model.to_string(),
            parameter: "image_urls".to_string(),
            max: capability.max_image_urls,
            actual: request.image_urls.len(),
        });
    }
    if request.video_urls.len() > capability.max_video_urls {
        return Err(MediaValidationError::TooManyInputs {
            model: model.to_string(),
            parameter: "video_urls".to_string(),
            max: capability.max_video_urls,
            actual: request.video_urls.len(),
        });
    }
    if request.audio_urls.len() > capability.max_audio_urls {
        return Err(MediaValidationError::TooManyInputs {
            model: model.to_string(),
            parameter: "audio_urls".to_string(),
            max: capability.max_audio_urls,
            actual: request.audio_urls.len(),
        });
    }
    if !request.video_urls.is_empty() && !capability.supports_video_reference {
        return Err(MediaValidationError::UnsupportedParameter {
            model: model.to_string(),
            parameter: "video_urls".to_string(),
        });
    }
    if !request.audio_urls.is_empty() && !capability.supports_audio_reference {
        return Err(MediaValidationError::UnsupportedParameter {
            model: model.to_string(),
            parameter: "audio_urls".to_string(),
        });
    }
    if !request.image_with_roles.is_empty() && !capability.supports_image_roles {
        return Err(MediaValidationError::UnsupportedParameter {
            model: model.to_string(),
            parameter: "image_with_roles".to_string(),
        });
    }
    if !request.image_urls.is_empty() && !request.image_with_roles.is_empty() {
        return Err(MediaValidationError::ConflictingInputs {
            model: model.to_string(),
            parameters: vec!["image_urls", "image_with_roles"],
        });
    }
    if model == DEFAULT_VIDEO_MODEL && !request.video_urls.is_empty() && request.duration.is_some()
    {
        return Err(MediaValidationError::ConflictingInputs {
            model: model.to_string(),
            parameters: vec!["video_urls", "duration"],
        });
    }

    Ok(ResolvedVideoGenerationRequest {
        model: model.to_string(),
    })
}

struct ImageCapability {
    sizes: &'static [&'static str],
    resolutions: &'static [&'static str],
    max_image_urls: usize,
    n_min: u8,
    n_max: u8,
    official_variant: bool,
}

struct VideoCapability {
    durations: &'static [u8],
    resolutions: &'static [&'static str],
    aspect_ratios: &'static [&'static str],
    sizes: &'static [&'static str],
    image_url_counts: Option<&'static [usize]>,
    max_image_urls: usize,
    max_video_urls: usize,
    max_audio_urls: usize,
    supports_image_roles: bool,
    supports_video_reference: bool,
    supports_audio_reference: bool,
}

impl VideoCapability {
    fn duration_labels(&self) -> Vec<&'static str> {
        self.durations
            .iter()
            .map(|value| match value {
                3 => "3",
                4 => "4",
                5 => "5",
                6 => "6",
                7 => "7",
                8 => "8",
                9 => "9",
                10 => "10",
                11 => "11",
                12 => "12",
                13 => "13",
                14 => "14",
                15 => "15",
                _ => "",
            })
            .filter(|value| !value.is_empty())
            .collect()
    }
}

fn image_capability(model: &str) -> Option<ImageCapability> {
    match model {
        "gpt-image-2" => Some(ImageCapability {
            sizes: &[
                "auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1",
                "1:2", "3:1", "1:3", "21:9", "9:21",
            ],
            resolutions: &["1k", "2k", "4k"],
            max_image_urls: 16,
            n_min: 1,
            n_max: 1,
            official_variant: false,
        }),
        "gemini-3-pro-image-preview" => Some(gemini_three_pro_image(false)),
        "gemini-3-pro-image-preview-official" => Some(gemini_three_pro_image(true)),
        "gemini-3.1-flash-image-preview" => Some(gemini_flash_image(false)),
        "gemini-3.1-flash-image-preview-official" => Some(gemini_flash_image(true)),
        _ => None,
    }
}

fn gemini_three_pro_image(official_variant: bool) -> ImageCapability {
    ImageCapability {
        sizes: &[
            "auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
        ],
        resolutions: &["1K", "2K", "4K"],
        max_image_urls: 14,
        n_min: 1,
        n_max: 4,
        official_variant,
    }
}

fn gemini_flash_image(official_variant: bool) -> ImageCapability {
    ImageCapability {
        sizes: &[
            "auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "5:4", "4:5", "21:9", "1:4",
            "4:1", "1:8", "8:1",
        ],
        resolutions: &["0.5K", "1K", "2K", "4K"],
        max_image_urls: 14,
        n_min: 1,
        n_max: 4,
        official_variant,
    }
}

fn video_capability(model: &str) -> Option<VideoCapability> {
    match model {
        "Omni-Flash-Ext" => Some(VideoCapability {
            durations: &[4, 6, 8, 10],
            resolutions: &["720p", "1080p", "4k"],
            aspect_ratios: &["16:9", "9:16"],
            sizes: &["16:9", "9:16"],
            image_url_counts: Some(&[0, 1, 3]),
            max_image_urls: 3,
            max_video_urls: 1,
            max_audio_urls: 0,
            supports_image_roles: false,
            supports_video_reference: true,
            supports_audio_reference: false,
        }),
        "doubao-seedance-2.0"
        | "doubao-seedance-2.0-fast"
        | "doubao-seedance-2.0-face"
        | "doubao-seedance-2.0-fast-face" => Some(VideoCapability {
            durations: &[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
            resolutions: &["480p", "720p", "1080p"],
            aspect_ratios: &[],
            sizes: &["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
            image_url_counts: None,
            max_image_urls: 9,
            max_video_urls: 3,
            max_audio_urls: 3,
            supports_image_roles: true,
            supports_video_reference: true,
            supports_audio_reference: true,
        }),
        "kling-v3-omni" => Some(VideoCapability {
            durations: &[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
            resolutions: &[],
            aspect_ratios: &["16:9", "9:16", "1:1"],
            sizes: &[],
            image_url_counts: None,
            max_image_urls: 0,
            max_video_urls: 1,
            max_audio_urls: 1,
            supports_image_roles: true,
            supports_video_reference: true,
            supports_audio_reference: true,
        }),
        _ => None,
    }
}

fn validate_allowed(
    model: &str,
    parameter: &str,
    value: &str,
    allowed: &'static [&'static str],
) -> Result<(), MediaValidationError> {
    if allowed.is_empty() || allowed.contains(&value) {
        return Ok(());
    }
    Err(MediaValidationError::InvalidValue {
        model: model.to_string(),
        parameter: parameter.to_string(),
        value: value.to_string(),
        allowed: allowed.to_vec(),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        validate_image_generation, validate_video_generation, ImageGenerationRequest,
        MediaValidationError, VideoGenerationRequest, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL,
    };

    #[test]
    fn defaults_to_lowest_cost_models() {
        let image = validate_image_generation(&ImageGenerationRequest::default()).unwrap();
        let video = validate_video_generation(&VideoGenerationRequest::default()).unwrap();

        assert_eq!(image.model, DEFAULT_IMAGE_MODEL);
        assert_eq!(video.model, DEFAULT_VIDEO_MODEL);
    }

    #[test]
    fn gpt_image_2_allows_sixteen_reference_images_but_only_one_output() {
        let request = ImageGenerationRequest {
            image_urls: (0..16)
                .map(|i| format!("https://example.com/{i}.png"))
                .collect(),
            n: Some(1),
            ..Default::default()
        };
        assert!(validate_image_generation(&request).is_ok());

        let too_many = ImageGenerationRequest {
            image_urls: (0..17)
                .map(|i| format!("https://example.com/{i}.png"))
                .collect(),
            ..Default::default()
        };
        assert_eq!(
            validate_image_generation(&too_many).unwrap_err(),
            MediaValidationError::TooManyInputs {
                model: DEFAULT_IMAGE_MODEL.to_string(),
                parameter: "image_urls".to_string(),
                max: 16,
                actual: 17,
            }
        );

        let invalid_n = ImageGenerationRequest {
            n: Some(2),
            ..Default::default()
        };
        assert!(matches!(
            validate_image_generation(&invalid_n).unwrap_err(),
            MediaValidationError::InvalidValue { parameter, .. } if parameter == "n"
        ));
    }

    #[test]
    fn gemini_official_image_model_rejects_official_fallback() {
        let request = ImageGenerationRequest {
            model: Some("gemini-3-pro-image-preview-official".to_string()),
            official_fallback: Some(true),
            ..Default::default()
        };

        assert_eq!(
            validate_image_generation(&request).unwrap_err(),
            MediaValidationError::UnsupportedParameter {
                model: "gemini-3-pro-image-preview-official".to_string(),
                parameter: "official_fallback".to_string(),
            }
        );
    }

    #[test]
    fn omni_flash_ext_allows_zero_one_or_three_image_references_only() {
        for count in [0, 1, 3] {
            let request = VideoGenerationRequest {
                image_urls: (0..count)
                    .map(|i| format!("https://example.com/{i}.png"))
                    .collect(),
                ..Default::default()
            };
            assert!(validate_video_generation(&request).is_ok());
        }

        let request = VideoGenerationRequest {
            image_urls: vec![
                "https://example.com/1.png".to_string(),
                "https://example.com/2.png".to_string(),
            ],
            ..Default::default()
        };
        assert_eq!(
            validate_video_generation(&request).unwrap_err(),
            MediaValidationError::UnsupportedInputCount {
                model: DEFAULT_VIDEO_MODEL.to_string(),
                parameter: "image_urls".to_string(),
                allowed: vec![0, 1, 3],
                actual: 2,
            }
        );
    }

    #[test]
    fn omni_flash_ext_video_extension_cannot_set_duration() {
        let request = VideoGenerationRequest {
            video_urls: vec!["https://example.com/source.mp4".to_string()],
            duration: Some(6),
            ..Default::default()
        };

        assert_eq!(
            validate_video_generation(&request).unwrap_err(),
            MediaValidationError::ConflictingInputs {
                model: DEFAULT_VIDEO_MODEL.to_string(),
                parameters: vec!["video_urls", "duration"],
            }
        );
    }

    #[test]
    fn doubao_accepts_multiple_images_videos_and_audio_but_rejects_image_mode_mix() {
        let request = VideoGenerationRequest {
            model: Some("doubao-seedance-2.0".to_string()),
            image_urls: (0..9)
                .map(|i| format!("https://example.com/{i}.png"))
                .collect(),
            video_urls: (0..3)
                .map(|i| format!("https://example.com/{i}.mp4"))
                .collect(),
            audio_urls: (0..3)
                .map(|i| format!("https://example.com/{i}.mp3"))
                .collect(),
            duration: Some(15),
            size: Some("adaptive".to_string()),
            resolution: Some("720p".to_string()),
            ..Default::default()
        };
        assert!(validate_video_generation(&request).is_ok());

        let mixed_image_modes = VideoGenerationRequest {
            model: Some("doubao-seedance-2.0".to_string()),
            image_urls: vec!["https://example.com/source.png".to_string()],
            image_with_roles: vec!["first_frame:https://example.com/source.png".to_string()],
            ..Default::default()
        };
        assert!(matches!(
            validate_video_generation(&mixed_image_modes).unwrap_err(),
            MediaValidationError::ConflictingInputs { parameters, .. }
                if parameters == vec!["image_urls", "image_with_roles"]
        ));
    }
}
