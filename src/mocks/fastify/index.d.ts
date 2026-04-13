export interface FastifyReply {
  status(code: number): this;
  send(payload?: any): this;
}
