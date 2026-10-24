import type { TestProject } from 'vitest/node';

/** 每次跑測試給一個編號：分檔平行跑的劇本（固定品系種子 1～6）把結果記在同一個資料夾，最後跑完的那檔算比例。 */
export default function setup(project: TestProject): void {
  project.provide('runId', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

declare module 'vitest' {
  export interface ProvidedContext {
    runId: string;
  }
}
