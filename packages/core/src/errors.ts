export type XdErrorCode =
  | 'Usage'
  | 'NoVectorPayload'
  | 'TokenExpired'
  | 'PrivateLink'
  | 'LinkNotFound'
  | 'FetchFailed'
  | 'NotAnXdFile'
  | 'InvalidAgc'
  | 'BrowserUnavailable'
  | 'TargetNotFound'
  | 'AmbiguousTarget'
  | 'NoPaintedGeometry';

export class XdError extends Error {
  readonly code: XdErrorCode;
  constructor(code: XdErrorCode, message: string) {
    super(message);
    this.name = 'XdError';
    this.code = code;
  }
}

export const EXIT_CODES: Record<XdErrorCode, number> = {
  Usage: 2,
  NoVectorPayload: 10,
  TokenExpired: 11,
  PrivateLink: 12,
  LinkNotFound: 13,
  FetchFailed: 14,
  NotAnXdFile: 20,
  InvalidAgc: 21,
  BrowserUnavailable: 30,
  TargetNotFound: 40,
  AmbiguousTarget: 41,
  NoPaintedGeometry: 42,
};

export const EXIT_VALIDATION_FAILED = 1;
export const EXIT_UNEXPECTED = 70;
