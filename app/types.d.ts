declare module "react-dom/server.edge" {
  export { renderToReadableStream } from "react-dom/server";
}

declare module "react-server-dom-webpack/client.browser" {
  type Thenable<T> = {
    then: (
      onFulfilled: (value: T) => void,
      onRejected: (reason: unknown) => void
    ) => void;
  };

  type CallServerCallback = <A, T>(id: string, args: A) => Promise<T>;

  export type Options = {
    callServer?: CallServerCallback;
  };
  export function createFromXHR<T>(
    request: XMLHttpRequest,
    options?: Options
  ): Thenable<T>;
  export function createFromFetch<T>(
    promiseForResponse: Promise<Response>,
    options?: Options
  ): Thenable<T>;
  export function createFromReadableStream<T>(
    stream: ReadableStream,
    options?: Options
  ): Thenable<T>;
  export function encodeReply(
    value: unknown
  ): Promise<string | URLSearchParams | FormData>;
  export {};
}

declare module "react-server-dom-webpack/client.edge" {
  type ClientReferenceMetadata = {
    id: string;
    chunks: Array<string>;
    name: string;
    async: boolean;
  };
  export type SSRManifest = {
    [clientId: string]: {
      [clientExportName: string]: ClientReferenceMetadata;
    };
  };
  type Options = {
    moduleMap?: SSRManifest;
  };
  type Thenable<T> = {
    then: (
      onFulfilled: (value: T) => void,
      onRejected: (reason: unknown) => void
    ) => void;
  };
  export function createFromReadableStream<T>(
    stream: ReadableStream,
    options?: Options
  ): Thenable<T>;
  export {};
}

declare module "react-server-dom-webpack/server.browser" {
  type ReactClientValue = unknown;
  type ServerContextJSONValue = unknown;
  type Options = {
    identifierPrefix?: string;
    signal?: AbortSignal;
    context?: Array<[string, ServerContextJSONValue]>;
    onError?: (error: unknown) => void;
  };
  export type ClientManifest = {
    [id: string]: ClientReferenceMetadata;
  };
  export type ClientReferenceMetadata = {
    id: string;
    chunks: Array<string>;
    name: string;
    async: boolean;
  };
  export function renderToReadableStream(
    model: ReactClientValue,
    webpackMap: ClientManifest,
    options?: Options
  ): ReadableStream;
  export {};
}
