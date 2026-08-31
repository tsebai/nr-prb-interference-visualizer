import type {
  ColumnMapping,
  InspectionResult,
  NormalizationResult,
  WorkerRequest,
  WorkerResponse,
} from "./types";

type WorkerRequestPayload =
  | Omit<Extract<WorkerRequest, { type: "inspect" }>, "id">
  | Omit<Extract<WorkerRequest, { type: "sheet" }>, "id">
  | Omit<Extract<WorkerRequest, { type: "normalize" }>, "id">;

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  progress?: (value: number, message: string) => void;
}

export class ParserWorkerClient {
  private readonly worker = new Worker(
    new URL("./worker.ts", import.meta.url),
    { type: "module" },
  );
  private readonly pending = new Map<
    number,
    PendingRequest<InspectionResult | NormalizationResult>
  >();
  private nextId = 1;

  constructor() {
    this.worker.addEventListener(
      "message",
      (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        const request = this.pending.get(response.id);
        if (!request) return;
        if (response.type === "progress") {
          request.progress?.(response.value, response.message);
          return;
        }
        this.pending.delete(response.id);
        if (response.type === "error")
          request.reject(new Error(response.error.message));
        else request.resolve(response.result);
      },
    );
    this.worker.addEventListener("error", () => {
      const error = new Error(
        "The local parser stopped unexpectedly. Reopen the file and try again.",
      );
      this.pending.forEach((request) => request.reject(error));
      this.pending.clear();
    });
  }

  inspect(
    file: File,
    kind: "csv" | "xlsx",
    onProgress?: (value: number, message: string) => void,
  ): Promise<InspectionResult> {
    return this.request<InspectionResult>(
      { type: "inspect", kind, file },
      onProgress,
    );
  }

  selectSheet(
    token: string,
    sheet: string,
    onProgress?: (value: number, message: string) => void,
  ): Promise<InspectionResult> {
    return this.request<InspectionResult>(
      { type: "sheet", token, sheet },
      onProgress,
    );
  }

  normalize(
    token: string,
    mapping: ColumnMapping,
    onProgress?: (value: number, message: string) => void,
  ): Promise<NormalizationResult> {
    return this.request<NormalizationResult>(
      { type: "normalize", token, mapping },
      onProgress,
    );
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
  }

  private request<T extends InspectionResult | NormalizationResult>(
    request: WorkerRequestPayload,
    onProgress?: (value: number, message: string) => void,
  ): Promise<T> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        progress: onProgress,
      });
      this.worker.postMessage({ ...request, id });
    });
  }
}
