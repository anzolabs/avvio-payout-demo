import { Global, Module } from '@nestjs/common';
import { LogService } from './log.service';
import { StateRepository } from './state.repository';

@Global()
@Module({
  providers: [StateRepository, LogService],
  exports: [StateRepository, LogService],
})
export class StoreModule {}
