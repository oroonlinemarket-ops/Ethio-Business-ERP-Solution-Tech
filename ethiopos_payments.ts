// ============================================================
// EthioPOS — Ethiopian Payment Gateway Integration
// Supports: Telebirr (Ethio Telecom) · CBE Birr (Commercial Bank)
// ============================================================

// ─── src/payments/payments.module.ts ─────────────────────────
import { Module }           from '@nestjs/common';
import { HttpModule }       from '@nestjs/axios';
import { TypeOrmModule }    from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService }    from './payments.service';
import { TelebirrService }    from './telebirr.service';
import { CbeBirrService }     from './cbe-birr.service';
import { PaymentTransaction } from './payment-transaction.entity';

@Module({
  imports: [
    HttpModule.register({ timeout: 30000, maxRedirects: 3 }),
    TypeOrmModule.forFeature([PaymentTransaction]),
  ],
  controllers: [PaymentsController],
  providers:   [PaymentsService, TelebirrService, CbeBirrService],
  exports:     [PaymentsService],
})
export class PaymentsModule {}

// ─── src/payments/telebirr.service.ts ────────────────────────
/**
 * Telebirr Payment Integration
 * Ethio Telecom Super App & USSD payment gateway
 * Docs: https://developer.ethiotelecom.et
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService }   from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as crypto       from 'crypto';
import { firstValueFrom } from 'rxjs';

export interface TelebirrPaymentRequest {
  amount:       number;       // ETB amount
  orderId:      string;       // Your internal order/invoice ID
  description:  string;       // e.g. "Purchase at EthioPOS – Bole Main"
  customerPhone:string;       // Ethiopian phone: 09xxxxxxxx
  notifyUrl:    string;       // Webhook URL for callback
  returnUrl?:   string;       // Redirect after payment
}

export interface TelebirrPaymentResult {
  success:      boolean;
  toPayUrl?:    string;       // URL to redirect customer (in-app or browser)
  tradeNo?:     string;       // Telebirr transaction reference
  outTradeNo:   string;       // Your order ID
  error?:       string;
}

@Injectable()
export class TelebirrService {
  private readonly logger = new Logger(TelebirrService.name);

  // Telebirr gateway base URL (production vs sandbox)
  private readonly baseUrl: string;
  private readonly appId:   string;
  private readonly appKey:  string;
  private readonly shortCode: string;
  private readonly publicKey: string; // Telebirr's RSA public key for encryption

  constructor(
    private http: HttpService,
    private cfg:  ConfigService,
  ) {
    const isProd = cfg.get('NODE_ENV') === 'production';
    this.baseUrl   = isProd
      ? 'https://196.188.120.3:38443/apiaccess/payment/gateway'
      : 'https://196.188.120.3:38443/apiaccess/payment/sandbox';
    this.appId      = cfg.get('TELEBIRR_APP_ID',   '');
    this.appKey     = cfg.get('TELEBIRR_APP_KEY',  '');
    this.shortCode  = cfg.get('TELEBIRR_SHORT_CODE','');
    this.publicKey  = cfg.get('TELEBIRR_PUBLIC_KEY','');
  }

  async initiatePayment(req: TelebirrPaymentRequest): Promise<TelebirrPaymentResult> {
    const timestamp  = Date.now().toString();
    const nonce      = crypto.randomBytes(8).toString('hex');

    // Build Telebirr payload per their API spec
    const ussd = {
      appId:         this.appId,
      shortCode:     this.shortCode,
      outTradeNo:    req.orderId,
      subject:       req.description.slice(0, 64),
      totalAmount:   req.amount.toFixed(2),
      timeoutExpress:'30m',
      notifyUrl:     req.notifyUrl,
      returnUrl:     req.returnUrl ?? '',
      receiveName:   'EthioPOS',
      nonce,
      timestamp,
    };

    // Telebirr requires the payload to be signed + encrypted with their RSA public key
    const rawStr  = this.buildSignatureString(ussd);
    const signed  = this.signWithAppKey(rawStr);
    const ussdStr = JSON.stringify(ussd);
    const encrypted = this.encryptWithPublicKey(ussdStr);

    try {
      const { data } = await firstValueFrom(
        this.http.post(`${this.baseUrl}/create`, {
          appid: this.appId,
          sign:  signed,
          ussd:  encrypted,
        }, {
          headers: { 'Content-Type': 'application/json', 'X-App-Key': this.appKey },
          httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }), // Telebirr uses self-signed cert
        }),
      );

      if (data.code === '0' && data.data) {
        const decrypted = this.decryptResponse(data.data);
        this.logger.log(`Telebirr payment initiated: ${req.orderId} → ${decrypted.toPayUrl}`);
        return {
          success:    true,
          toPayUrl:   decrypted.toPayUrl,
          tradeNo:    decrypted.tradeNo,
          outTradeNo: req.orderId,
        };
      }

      this.logger.error(`Telebirr error: ${data.msg} (code: ${data.code})`);
      return { success: false, outTradeNo: req.orderId, error: data.msg ?? 'Payment initiation failed' };

    } catch (err: any) {
      this.logger.error(`Telebirr request failed: ${err.message}`);
      throw new BadRequestException(`Telebirr payment error: ${err.message}`);
    }
  }

  // Verify callback from Telebirr (webhook)
  verifyCallback(payload: any, receivedSign: string): boolean {
    const rawStr  = this.buildSignatureString(payload);
    const expected = this.signWithAppKey(rawStr);
    return expected === receivedSign;
  }

  // Query payment status (polling fallback)
  async queryPaymentStatus(outTradeNo: string): Promise<{
    status: 'pending' | 'paid' | 'failed' | 'cancelled';
    tradeNo?: string;
    paidAmount?: number;
    paidAt?: Date;
  }> {
    const timestamp = Date.now().toString();
    const payload   = { appId: this.appId, outTradeNo, timestamp };
    const sign      = this.signWithAppKey(this.buildSignatureString(payload));

    try {
      const { data } = await firstValueFrom(
        this.http.post(`${this.baseUrl}/query`, { ...payload, sign }, {
          headers: { 'Content-Type': 'application/json', 'X-App-Key': this.appKey },
          httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
        }),
      );

      if (data.code !== '0') return { status: 'pending' };
      const info = data.data;
      const stateMap: Record<string, any> = {
        '2': 'paid', '3': 'failed', '4': 'cancelled',
      };
      return {
        status:     stateMap[info.tradeState] ?? 'pending',
        tradeNo:    info.msisdn,
        paidAmount: info.transAmount ? parseFloat(info.transAmount) : undefined,
        paidAt:     info.tranTime ? new Date(info.tranTime) : undefined,
      };
    } catch {
      return { status: 'pending' };
    }
  }

  // Refund (credit note / return)
  async refund(tradeNo: string, refundAmount: number, reason: string): Promise<boolean> {
    const timestamp = Date.now().toString();
    const payload   = { appId: this.appId, tradeNo, refundAmount: refundAmount.toFixed(2), reason, timestamp };
    const sign      = this.signWithAppKey(this.buildSignatureString(payload));

    try {
      const { data } = await firstValueFrom(
        this.http.post(`${this.baseUrl}/refund`, { ...payload, sign }, {
          headers: { 'Content-Type': 'application/json', 'X-App-Key': this.appKey },
          httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
        }),
      );
      return data.code === '0';
    } catch {
      return false;
    }
  }

  // Private helpers
  private buildSignatureString(params: Record<string, any>): string {
    return Object.keys(params)
      .filter(k => k !== 'sign' && params[k] !== '' && params[k] !== null)
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&') + `&key=${this.appKey}`;
  }

  private signWithAppKey(rawStr: string): string {
    return crypto.createHash('sha256').update(rawStr).digest('hex').toUpperCase();
  }

  private encryptWithPublicKey(data: string): string {
    const pubKey = `-----BEGIN PUBLIC KEY-----\n${this.publicKey}\n-----END PUBLIC KEY-----`;
    const buf    = Buffer.from(data);
    // RSA/ECB/PKCS1Padding — Telebirr spec
    return crypto.publicEncrypt(
      { key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      buf,
    ).toString('base64');
  }

  private decryptResponse(encrypted: string): any {
    // Telebirr response is base64 — some responses are plain JSON
    try {
      return JSON.parse(Buffer.from(encrypted, 'base64').toString('utf8'));
    } catch {
      return JSON.parse(encrypted);
    }
  }
}

// ─── src/payments/cbe-birr.service.ts ────────────────────────
/**
 * CBE Birr Payment Integration
 * Commercial Bank of Ethiopia — mobile payment service
 */
@Injectable()
export class CbeBirrService {
  private readonly logger = new Logger(CbeBirrService.name);
  private readonly baseUrl:    string;
  private readonly merchantId: string;
  private readonly apiKey:     string;

  constructor(private http: HttpService, private cfg: ConfigService) {
    const isProd    = cfg.get('NODE_ENV') === 'production';
    this.baseUrl    = isProd
      ? 'https://api.cbebirr.et/merchant/v1'
      : 'https://sandbox.cbebirr.et/merchant/v1';
    this.merchantId = cfg.get('CBE_MERCHANT_ID', '');
    this.apiKey     = cfg.get('CBE_API_KEY',     '');
  }

  async initiatePayment(req: {
    amount:       number;
    orderId:      string;
    description:  string;
    customerPhone:string;
    callbackUrl:  string;
  }): Promise<{ success: boolean; qrCode?: string; deepLink?: string; sessionId?: string; error?: string }> {
    const headers = {
      'Content-Type':   'application/json',
      'X-Merchant-ID':  this.merchantId,
      'X-API-Key':      this.apiKey,
      'X-Timestamp':    Date.now().toString(),
      'X-Signature':    this.buildSignature(req),
    };

    try {
      const { data } = await firstValueFrom(
        this.http.post(`${this.baseUrl}/payment/initiate`, {
          merchantId:    this.merchantId,
          orderId:       req.orderId,
          amount:        req.amount.toFixed(2),
          currency:      'ETB',
          description:   req.description,
          customerMsisdn:req.customerPhone.replace(/^0/, '+251'),
          callbackUrl:   req.callbackUrl,
          expiryMinutes: 30,
        }, { headers }),
      );

      if (data.status === 'SUCCESS') {
        this.logger.log(`CBE Birr payment initiated: ${req.orderId}`);
        return {
          success:   true,
          qrCode:    data.qrCode,       // QR code string for display
          deepLink:  data.deepLink,     // cbebirr://pay?... for mobile
          sessionId: data.sessionId,
        };
      }
      return { success: false, error: data.message ?? 'CBE Birr initiation failed' };

    } catch (err: any) {
      this.logger.error(`CBE Birr error: ${err.message}`);
      throw new BadRequestException(`CBE Birr payment error: ${err.message}`);
    }
  }

  async verifyPayment(sessionId: string): Promise<{
    paid: boolean; amount?: number; reference?: string; paidAt?: string;
  }> {
    try {
      const { data } = await firstValueFrom(
        this.http.get(`${this.baseUrl}/payment/verify/${sessionId}`, {
          headers: { 'X-Merchant-ID': this.merchantId, 'X-API-Key': this.apiKey },
        }),
      );
      if (data.status === 'COMPLETED') {
        return { paid: true, amount: data.amount, reference: data.bankReference, paidAt: data.completedAt };
      }
      return { paid: false };
    } catch {
      return { paid: false };
    }
  }

  async refund(reference: string, amount: number, reason: string): Promise<boolean> {
    try {
      const { data } = await firstValueFrom(
        this.http.post(`${this.baseUrl}/payment/refund`, {
          bankReference: reference, amount: amount.toFixed(2), reason,
        }, {
          headers: { 'X-Merchant-ID': this.merchantId, 'X-API-Key': this.apiKey },
        }),
      );
      return data.status === 'SUCCESS';
    } catch {
      return false;
    }
  }

  private buildSignature(payload: any): string {
    const raw = `${this.merchantId}:${payload.orderId}:${payload.amount}:${this.apiKey}`;
    return crypto.createHmac('sha256', this.apiKey).update(raw).digest('hex');
  }
}

// ─── src/payments/payments.service.ts ────────────────────────
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import { PaymentTransaction } from './payment-transaction.entity';

@Injectable()
export class PaymentsService {
  constructor(
    private telebirr: TelebirrService,
    private cbeBirr:  CbeBirrService,
    @InjectRepository(PaymentTransaction) private txRepo: Repository<PaymentTransaction>,
  ) {}

  async initiatePayment(params: {
    method:       'telebirr' | 'cbe_birr';
    amount:       number;
    orderId:      string;
    description:  string;
    customerPhone:string;
    tenantId:     string;
    branchId:     string;
    callbackBase: string;
  }) {
    const notifyUrl  = `${params.callbackBase}/api/v1/payments/webhook/${params.method}`;
    let result: any;

    if (params.method === 'telebirr') {
      result = await this.telebirr.initiatePayment({
        amount:       params.amount,
        orderId:      params.orderId,
        description:  params.description,
        customerPhone:params.customerPhone,
        notifyUrl,
      });
    } else {
      result = await this.cbeBirr.initiatePayment({
        amount:       params.amount,
        orderId:      params.orderId,
        description:  params.description,
        customerPhone:params.customerPhone,
        callbackUrl:  notifyUrl,
      });
    }

    // Persist transaction record
    await this.txRepo.save({
      tenant_id:       params.tenantId,
      branch_id:       params.branchId,
      order_id:        params.orderId,
      method:          params.method,
      amount:          params.amount,
      gateway_ref:     result.tradeNo ?? result.sessionId,
      status:          'pending',
    });

    return result;
  }

  // Webhook handler — called by Telebirr/CBE Birr servers
  async handleWebhook(method: 'telebirr' | 'cbe_birr', payload: any, signature: string) {
    // Verify signature
    let verified = false;
    if (method === 'telebirr') {
      verified = this.telebirr.verifyCallback(payload, signature);
    } else {
      // CBE Birr uses HMAC — verified differently
      verified = true; // implement CBE Birr callback signature verification
    }

    if (!verified) throw new BadRequestException('Invalid webhook signature');

    const orderId = payload.outTradeNo ?? payload.orderId;
    const status  = (payload.tradeState === '2' || payload.status === 'COMPLETED') ? 'paid' : 'failed';

    await this.txRepo.update({ order_id: orderId }, {
      status,
      gateway_ref: payload.tradeNo ?? payload.bankReference,
      paid_at: status === 'paid' ? new Date() : undefined,
    });

    return { received: true, orderId, status };
  }

  async processRefund(method: 'telebirr' | 'cbe_birr', ref: string, amount: number, reason: string) {
    if (method === 'telebirr') return this.telebirr.refund(ref, amount, reason);
    return this.cbeBirr.refund(ref, amount, reason);
  }
}

// ─── src/payments/payments.controller.ts ─────────────────────
import { Controller, Post, Get, Body, Param, Headers, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  async initiate(@Body() dto: any, @CurrentUser() user: any) {
    return this.paymentsService.initiatePayment({
      method:       dto.method,
      amount:       dto.amount,
      orderId:      dto.orderId,
      description:  dto.description,
      customerPhone:dto.customerPhone,
      tenantId:     user.tenant_id,
      branchId:     user.branch_id,
      callbackBase: process.env.API_BASE_URL ?? 'https://api.ethiopos.et',
    });
  }

  // Webhook endpoints — no auth (called by payment gateways)
  @Post('webhook/telebirr')
  async webhookTelebirr(
    @Body() payload: any,
    @Headers('x-sign') sign: string,
  ) {
    return this.paymentsService.handleWebhook('telebirr', payload, sign);
  }

  @Post('webhook/cbe_birr')
  async webhookCbeBirr(
    @Body() payload: any,
    @Headers('x-signature') sign: string,
  ) {
    return this.paymentsService.handleWebhook('cbe_birr', payload, sign);
  }

  @Get('status/:orderId')
  @UseGuards(JwtAuthGuard)
  async getStatus(@Param('orderId') orderId: string) {
    return this.paymentsService.initiatePayment as any; // simplified
  }
}

// ─── src/sms/sms.service.ts — OTP/MFA via Ethiopian SMS ─────
/**
 * SMS OTP Service — supports multiple Ethiopian SMS gateways
 * Providers: AfricasTalking (recommended for Ethiopia), Ethio Telecom SMS API
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private cfg: ConfigService) {}

  async sendOTP(phone: string, otp: string): Promise<boolean> {
    const message = `Your EthioPOS login code is: ${otp}. Valid for 5 minutes. Do not share. / ኮድዎ: ${otp}`;
    const provider = this.cfg.get('SMS_PROVIDER', 'africas_talking');

    if (provider === 'africas_talking') return this.sendAfricasTalking(phone, message);
    if (provider === 'ethio_telecom')   return this.sendEthioTelecom(phone, message);
    this.logger.warn(`No SMS provider configured. OTP: ${otp}`); // dev mode
    return true;
  }

  private async sendAfricasTalking(phone: string, message: string): Promise<boolean> {
    // Africa's Talking Ethiopian SMS gateway (supports Ethio Telecom numbers)
    const formData = new URLSearchParams({
      username: this.cfg.get('AT_USERNAME', ''),
      to:       phone.startsWith('+') ? phone : `+251${phone.slice(1)}`,
      message,
      from:     'EthioPOS',
    });

    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method:  'POST',
      headers: {
        Accept:        'application/json',
        'Content-Type':'application/x-www-form-urlencoded',
        apiKey:        this.cfg.get('AT_API_KEY', ''),
      },
      body: formData,
    });
    const data = await res.json();
    return data?.SMSMessageData?.Recipients?.[0]?.status === 'Success';
  }

  private async sendEthioTelecom(phone: string, message: string): Promise<boolean> {
    const res = await fetch(`${this.cfg.get('ETHIO_SMS_URL')}/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.get('ETHIO_SMS_KEY')}` },
      body: JSON.stringify({ to: phone, message, shortCode: this.cfg.get('ETHIO_SHORT_CODE') }),
    });
    const data = await res.json();
    return data.status === 'SENT';
  }

  async sendLowStockAlert(phone: string, productName: string, qty: number, branch: string) {
    return this.sendSMS(phone,
      `⚠️ EthioPOS Alert: ${productName} is running low (${qty} units) at ${branch}. Order now. / አቅርቦት ዝቅ ብሏል`
    );
  }

  async sendVATReminder(phone: string, amount: number, dueDate: string) {
    return this.sendSMS(phone,
      `📋 EthioPOS: VAT payment of ETB ${amount.toLocaleString()} due ${dueDate}. File with ERCA to avoid penalties.`
    );
  }

  async sendPaymentConfirmation(phone: string, amount: number, method: string, invoiceNo: string) {
    return this.sendSMS(phone,
      `✅ EthioPOS: Payment of ETB ${amount.toLocaleString()} via ${method} received for ${invoiceNo}. ame·segenaw!`
    );
  }

  private async sendSMS(to: string, message: string): Promise<boolean> {
    return this.sendAfricasTalking(to, message);
  }
}

// ─── src/payments/payment-transaction.entity.ts ──────────────
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('payment_transactions')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()         tenant_id:   string;
  @Column()         branch_id:   string;
  @Column()         order_id:    string;
  @Column()         method:      string;   // telebirr, cbe_birr, cash, credit
  @Column('decimal',{ precision:14,scale:2 }) amount: number;
  @Column({ nullable: true }) gateway_ref: string;
  @Column({ default: 'pending' }) status: string; // pending, paid, failed, refunded
  @Column({ nullable: true, type: 'timestamptz' }) paid_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
