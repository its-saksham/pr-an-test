export interface ODataErrorResponse {
  'odata.error'?: {
    code?: string;
    message?: {
      lang?: string;
      value?: string;
    };
  };
}
