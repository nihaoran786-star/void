import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'public/monaco-editor/**',
      'src/**/*.example.tsx',
      'src/component-library/components/registry.tsx',
      'src/component-library/preview/**',
      'src/shared/context-system/core/types/**',
      'src/shared/context-menu-system/examples/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-use-before-define': 'off',
      'no-case-declarations': 'warn',
      'no-cond-assign': 'warn',
      'no-control-regex': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'warn',
      '@typescript-eslint/no-use-before-define': [
        'error',
        {
          functions: false,
          classes: true,
          variables: true,
          enums: true,
          typedefs: true,
          ignoreTypeReferences: true,
        },
      ],
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // ——— Infinite-canvas refactor guardrails ————————————————————————————————
  //
  // These four rules exist to hold the shape the canvas refactor is moving
  // toward. `scripts/check-core-boundaries.mjs` already guards the same seams
  // from the outside; these catch them in the editor, before a commit.
  //
  // Every existing violation is listed by name below with the reason it is
  // still there. The lists only shrink: a NEW file that trips one of these
  // rules is an error, not a line in the list.
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app', '@/app/*', '@/app/**'],
              message:
                'shared/ is the layer app/ builds on; it must not reach back into the app shell. Move the shared piece down into shared/, or invert the call with a callback the app registers.',
            },
          ],
        },
      ],
    },
  },
  {
    // Six pre-existing shared -> app imports, all predating this line of work
    // and none of them part of the canvas refactor. Each is a type or store
    // that belongs in shared but currently lives under app/:
    //
    //  - ide-control/api.ts, ide-control/types.ts — the panel/tab content
    //    types (`PanelContent`, `TabData`, `PanelContentType`) and the
    //    settings-tab normalizer still live under app/.
    //  - openShellSessionTarget.ts, sceneOpenTargetResolver.ts — the scene tab
    //    id type plus the scene/terminal-scene zustand stores, which are app
    //    state by construction.
    //  - shared/types/tab.ts, shared/utils/tabUtils.ts — the content-canvas
    //    tab event constants and types.
    //
    // Untangling these is its own change; nothing new goes on this list.
    files: [
      'src/shared/services/ide-control/api.ts',
      'src/shared/services/ide-control/types.ts',
      'src/shared/services/openShellSessionTarget.ts',
      'src/shared/services/sceneOpenTargetResolver.ts',
      'src/shared/types/tab.ts',
      'src/shared/utils/tabUtils.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['src/app/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps', '@tauri-apps/*', '@tauri-apps/**'],
              message:
                'components render; reach the desktop runtime through the API layer (@/infrastructure/api) or a typed service, not @tauri-apps directly.',
            },
          ],
        },
      ],
      // `api.invoke(...)` is a call, not an import, so no-restricted-imports
      // cannot see it. This selector matches every arity and every type
      // argument, including the dynamic-import form the canvas gateway used.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.type="MemberExpression"][callee.property.name="invoke"][callee.object.name="api"]',
          message:
            'components do not talk to the desktop backend directly; call a typed service in shared/services or an adapter in infrastructure/services instead of api.invoke.',
        },
      ],
    },
  },
  {
    // Window chrome and native file pickers: these files ARE the desktop
    // shell, and the window handle and OS dialog have no service to route
    // through. Same list as check-core-boundaries.mjs, kept in step with it.
    files: [
      'src/app/components/AgentCompanionDesktopPet/AgentCompanionDesktopPet.tsx',
      'src/app/components/NavBar/NavBar.tsx',
      'src/app/components/NavPanel/MainNav.tsx',
      'src/app/components/NavPanel/sections/workspaces/WorkspaceRelatedPathsDialog.tsx',
      'src/app/components/NewProjectDialog/NewProjectDialog.tsx',
      'src/app/components/SceneBar/SceneBar.tsx',
      'src/app/components/TeamWorkspaceDesktopWindow/TeamWorkspaceDesktopWindow.tsx',
      // Its test, which mocks the window module the component above uses.
      'src/app/components/TeamWorkspaceDesktopWindow/TeamWorkspaceDesktopWindow.test.tsx',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // The infinite canvas is a module, not a chat surface. It reads the chat
    // lane only through the neutral canvas-short-drama layer and the shared
    // services, never by importing flow_chat. There are no violations today —
    // the last one was deleted in the dead-code pass — so this rule is here to
    // stop it coming back.
    files: [
      'src/app/components/panels/content-canvas/infinite-canvas/**/*.{ts,tsx}',
    ],
    // Flat config replaces a rule's options rather than merging them, so the
    // @tauri-apps group from the app/components block is repeated here.
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps', '@tauri-apps/*', '@tauri-apps/**'],
              message:
                'components render; reach the desktop runtime through the API layer (@/infrastructure/api) or a typed service, not @tauri-apps directly.',
            },
            {
              group: ['@/flow_chat', '@/flow_chat/*', '@/flow_chat/**'],
              message:
                'the infinite canvas must not import flow_chat; go through shared/services/infinite-canvas or the neutral canvas-short-drama layer.',
            },
          ],
        },
      ],
    },
  },
  {
    // Descending ladder, not a permanent ceiling. 4200 clears the largest
    // panel today (InfiniteCanvasPanel.tsx, 4142 lines) by one notch. Each
    // extraction that lands should drop this to the next step down — 3900,
    // 3500, 3000 — so the number can only ever go one direction. `warn`
    // because it is a ratchet, not a gate; the gate is that it never rises.
    files: ['src/app/components/panels/**/*.{ts,tsx}'],
    rules: {
      'max-lines': ['warn', { max: 4200, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ['*.{ts,mts,cts}', '*.config.{ts,mts,cts}', 'vite.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
      parser: tseslint.parser,
    },
  },
);
