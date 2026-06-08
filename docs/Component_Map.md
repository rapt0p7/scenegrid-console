# Карта компонентов проекта

> **Назначение.** Маршрутизатор «файл → назначение по доменам». Главная экономия токенов: агент идёт сюда **до** любого `Glob`/`Grep`/`Read` по коду и часто находит нужный файл сразу.

> После каждой задачи, где появились новые ключевые файлы — точечно дописывай нужный раздел. Не переписывай карту целиком.

> **Формат записи.** Таблица «Файл → Назначение, 5-12 слов на запись». Не сочинения, а сухие маршруты.

---

## Пакет `@scene-grid/shared` (Фундамент / Общие типы)
*Локация: `packages/shared/src/`*

| Файл | Назначение |
|------|-----------|
| `Types/Branded.ts` | Брендированные типы (`SoundId`, `PlaybackId`) для строгой защиты от невалидных состояний |
| `Types/Condition.ts` | Алгебраические типы операторов и единые DTO контракты доменных условий |
| `Math/SeededPRNG.ts` | Детерминированный генератор псевдослучайных чисел, безопасный для воспроизводимости оффлайн-рендера |
| `Telemetry/TelemetryBatch.ts` | DTO и контракты пакетной передачи Zero-Allocation телеметрии в DevTools |

## Пакет `@scene-grid/engine` — Слой Application (Точка сборки)
*Локация: `packages/engine/src/Application/`*

| Файл | Назначение |
|------|-----------|
| `AudioEngine.ts` | Главный фасад (Composition Root), точка инициализации графа и инъекции зависимостей |
| `Ports/IAudioEngine.ts` | Строгий публичный контракт API (Deep Module) для игрового клиента |

## Пакет `@scene-grid/engine` — Слой Domain (Бизнес-логика)
*Локация: `packages/engine/src/Domain/`*

| Файл | Назначение |
|------|-----------|
| `Configuration/SoundRegistry.ts` | Доменное хранилище метаданных и конфигураций звуков без привязки к инфраструктуре |
| `Orchestration/AudioEventOrchestrator.ts` | Stateless-машина выполнения Data-Driven макросов и событий с темпоральной логикой |
| `Orchestration/Sequencer.ts` | Оркестратор интерактивной музыки (Smart Loops) и горизонтального фазового секвенсинга |
| `Orchestration/SmartLoopTransitionPolicy.ts`| Вычисление и валидация переходов между магнитами (Magnet Regions) секвенсора |
| `Mixer/MixerTransitionEngine.ts` | Математика VCA-микшера и интерполяции кроссфейдов между состояниями шин |
| `Mixer/MixerSnapshotManager.ts` | Управление независимыми слоями (Layers) и снимками стейтов микшера |
| `Router/AudioRouter.ts` | Маршрутизатор запуска аудио-ресурсов и резолвер сложных логических контейнеров |
| `Managers/ContainerPlaybackPolicy.ts` | Чистая логика выбора вариаций (Random/Sequence) с поддержкой No-Repeat гистерезиса |
| `Managers/SwitchPlaybackPolicy.ts` | Детерминированная логика переключения стейтов (Switch) с алгоритмом мертвой зоны |
| `Shared/Evaluators/ConditionEvaluator.ts`| Чистая функция оценки условий (Триггер Шмитта) без побочных эффектов |
| `Validation/ConsistencyChecker.ts` | AOT-анализатор графа зависимостей для выявления петель и невалидных роутов |

## Пакет `@scene-grid/engine` — Слой Infrastructure (Web Audio & State)
*Локация: `packages/engine/src/Infrastructure/`*

| Файл | Назначение |
|------|-----------|
| `busSystem/AudioBusSystem.ts` | Физическое управление Web Audio графом шин, эффектами и sidechain-компрессией |
| `instance/SoundPoolManager.ts`| Zero-Allocation пул голосов (`SoundInstance`) для жесткого контроля полифонии и памяти |
| `instance/SoundInstance.ts` | Обертка узлов `AudioBufferSourceNode`, управляющая жизненным циклом одного физического голоса |
| `loader/AudioBufferLoader.ts` | In-memory кэш-загрузчик бинарных аудио-ресурсов с поддержкой batch-запросов |
| `loader/BankManagerAdapter.ts`| Управление in-memory ресурсами, инвалидация пулов и сборка мусора (GC) |
| `loader/SoundController.ts` | Инфраструктурный исполнитель команд роутера и источник событий Lifecycle-телеметрии |
| `state/SwitchHistoryRegistry.ts`| Плоский Data-Oriented кэш истории состояний свитчей для работы гистерезиса |
| `state/ContainerHistoryRegistry.ts`| Хранилище истории воспроизведения контейнеров для защиты от эффекта пулемета |
| `scheduling/EngineTicker.ts` | Центральный 16-мс цикл (Time Injection) для всех ITickable подсистем движка |
| `telemetry/TelemetryDispatcher.ts`| Центральный сборщик батчей телеметрии с In-Place мутацией (Zero-Allocation паттерн) |
| `telemetry/TelemetrySnapshotter.ts`| Снятие слепков состояний (RTPC, Playbacks) через преаллоцированные пулы объектов |
| `telemetry/BrowserTelemetryTransport.ts`| Адаптер транспорта метрик в инспектор (DevTools) через API `postMessage` |
| `nodes/MasterOutput.ts` | Выходная точка аудиографа с brickwall-лимитером и веткой `silentTail` |

## Пакет `@scene-grid/engine` — Слой Kernel (Математическое ядро)
*Локация: `packages/engine/src/Kernel/`*

| Файл | Назначение |
|------|-----------|
| `RTPC/RTPCManager.ts` | DOD-процессор макро-параметров (Control Voltage) с интерполяцией и slew rates |

## Пакет `@scene-grid/inspector` (DevTools 2.0)
*Локация: `packages/inspector/src/`*

| Файл | Назначение |
|------|-----------|
| `AudioDebugger.ts` | Ядро DevTools 2.0, связывающее UI-инспектор с потоком телеметрии движка |
| `AudioDebugPanel.ts` | Панель управления (Tweakpane) для визуального дебага микшера и RTPC |
| `AudioProfiler.ts` | Агрегатор метрик производительности и статистики активных/виртуальных голосов пула |
| `visualizers.ts` | WebGL-отрисовка анализаторов спектра и RMS-метров для инспектора |
| `worklets/meter.processor.ts`| `AudioWorklet` для аппаратного снятия уровней громкости (RMS) без нагрузки на UI |