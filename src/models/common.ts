export enum BusinessTypeEnum {
  B2C = 'B2C',
  B2B = 'B2B'
}

export class BadRequestErrorResponseDto {
  message: string;
}

export class InternalServerErrorResponseDto {
  message: string;
}
