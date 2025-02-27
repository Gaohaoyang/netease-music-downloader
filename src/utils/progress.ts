import { MultiBar, SingleBar, Options, Presets } from 'cli-progress';

export function createMultiBar(): MultiBar {
  return new MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: ' [{bar}] {percentage}% || {value}/{total} KB - {name}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    stopOnComplete: false,
    barsize: 30,
    noTTYOutput: true,
    notTTYSchedule: 1000 // Update every second in non-TTY environments
  }, Presets.shades_classic);
}

export function createSingleBar(options?: Options): SingleBar {
  return new SingleBar({
    format: '下载进度 |{bar}| {percentage}% || {value}/{total} KB',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
    noTTYOutput: true,
    notTTYSchedule: 1000, // Update every second in non-TTY environments
    ...options
  });
}
