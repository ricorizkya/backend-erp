import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { AccountingController } from './accounting.controller';
import { FiscalPeriodService } from './services/fiscal-period.service';
import { AccountService } from './services/account.service';
import { JournalEntryService } from './services/journal-entry.service';
import { GeneralLedgerService } from './services/general-ledger.service';
import { ApService } from './services/ap.service';
import { ArService } from './services/ar.service';
import { BankService } from './services/bank.service';

@Module({
  imports: [CommonModule],
  controllers: [AccountingController],
  providers: [
    FiscalPeriodService,
    AccountService,
    JournalEntryService,
    GeneralLedgerService,
    ApService,
    ArService,
    BankService,
  ],
  exports: [
    JournalEntryService,
    AccountService,
    FiscalPeriodService,
    ApService,
    ArService,
  ],
})
export class AccountingModule {}
