import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { TokenService } from './token.service';

@Global()
@Module({
  providers: [EncryptionService, TokenService],
  exports: [EncryptionService, TokenService],
})
export class SecurityModule {}
