// src/email/email.service.ts
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { BrevoClient } from '@getbrevo/brevo';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly brevo: BrevoClient;
  private readonly senderEmail: string;
  private readonly senderName: string;

   constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('BREVO_API_KEY');

        if (!apiKey) {
            throw new Error('BREVO_API_KEY is not configured');
        }

        this.senderEmail =
        this.configService.get<string>('BREVO_SENDER_EMAIL') ?? '';

        this.senderName =
        this.configService.get<string>('BREVO_SENDER_NAME') ?? 'litmart';

        if (!this.senderEmail) {
            throw new Error('BREVO_SENDER_EMAIL is not configured');
        }

        this.brevo = new BrevoClient({ apiKey });
   }
   // Changed to public so other services (Auth, Orders) can call it
    private async sendTemplateEmail(
        email: string,
        name: string,
        templateId: number,
        params: Record<string, any>, // Changed to 'any' to support nested structures or numbers in templates
    ): Promise<void> {
        try {
            await this.brevo.transactionalEmails.sendTransacEmail({
                to: [{ email, name }],
                sender: {
                    email: this.senderEmail,
                    name: this.senderName,
                },
                templateId,
                params,
            });

            this.logger.log(`Email successfully submitted for ${email}`);
        } catch (error) {
            this.logger.error(
                `Failed to send email to ${email}`,
                error instanceof Error ? error.stack : String(error),
            );

            throw new InternalServerErrorException(
                'Unable to send email. Please try again later.',
            );
        }
    }
    private getTemplateId(key: string): number {
        const value = this.configService.get<string>(key);
        const templateId = Number(value);

        if (!value || !Number.isInteger(templateId) || templateId <= 0) {
            throw new Error(`${key} is missing or invalid`);
        }

        return templateId;
    }
    //Public Methods
    async sendVerificationEmail(
        email: string,
        name: string,
        token: string,
    ): Promise<void> {
        const templateId = this.getTemplateId(
            'BREVO_VERIFICATION_TEMPLATE_ID',
        );

        await this.sendTemplateEmail(email, name, templateId, {
            name,
            token,
        });
    }
    async sendVerifiedEmail(
        email: string,
        name: string,
    ): Promise<void> {
        const templateId = this.getTemplateId(
            'BREVO_VERIFIED_TEMPLATE_ID',
        );

        await this.sendTemplateEmail(email, name, templateId, {
            name,
        });
    }
    async sendPasswordResetEmail(
        email: string,
        name: string,
        resetUrl: string,
    ): Promise<void> {
        const templateId = this.getTemplateId(
           'BREVO_PASSWORD_RESET_TEMPLATE_ID',
        );

        await this.sendTemplateEmail(email, name, templateId, {
            name,
            resetUrl,
        });
    }
    async sendPasswordChangedEmail(
        email: string,
        name: string,
    ): Promise<void> {
        const templateId = this.getTemplateId(
            'BREVO_PASSWORD_CHANGED_TEMPLATE_ID',
        );

        await this.sendTemplateEmail(email, name, templateId, {
            name,
        });
    }
}
