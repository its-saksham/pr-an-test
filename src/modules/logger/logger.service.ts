import { Injectable } from '@nestjs/common';

@Injectable()
export default class LoggerService {
  info(logData: any) {
    console.log('[INFO]', JSON.stringify(logData, null, 2));
  }
  error(logData: any) {
    console.error('[ERROR]', JSON.stringify(logData, null, 2));
  }
}
