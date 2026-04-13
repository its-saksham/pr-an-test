import { ClsService } from 'nestjs-cls';
import LoggerService from '../modules/logger/logger.service';

export default abstract class Base {
  constructor(protected readonly logger: LoggerService, protected readonly cls: ClsService) {}
}
