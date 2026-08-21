<?php

declare(strict_types=1);

namespace Phillips\Tms\Support;

/**
 * Resend REST client.
 *
 * Deliberately plain cURL: this service has no Composer step, so pulling in the
 * official SDK would change how it deploys. The API surface used here is one
 * POST.
 *
 * Sending domain: Resend only accepts a `from` address on a domain verified in
 * the account that owns the API key. Setting MAIL_FROM to an unverified domain
 * returns a 403 and the address never receives anything, so the failure is
 * surfaced to the caller rather than swallowed.
 */
final class Mailer
{
    private const ENDPOINT = 'https://api.resend.com/emails';

    public function isConfigured(): bool
    {
        return (string) Env::get('RESEND_API_KEY', '') !== '';
    }

    public function fromHeader(): string
    {
        $address = (string) Env::get('MAIL_FROM', 'training@inspirtag.com');
        $name = (string) Env::get('MAIL_FROM_NAME', 'Phillips Consulting');

        if ($name === '') {
            return $address;
        }

        // Quote the display name so commas or dots cannot split the header.
        return sprintf('%s <%s>', self::quoteDisplayName($name), $address);
    }

    private static function quoteDisplayName(string $name): string
    {
        $clean = str_replace(['"', "\r", "\n"], '', $name);

        return '"' . $clean . '"';
    }

    /**
     * @param array{to: string, subject: string, html: string, text: string, reply_to?: string} $message
     * @return array{ok: bool, id?: string, error?: string, status?: int}
     */
    public function send(array $message): array
    {
        if (!$this->isConfigured()) {
            return [
                'ok' => false,
                'status' => 0,
                'error' => 'Email is not configured on this server (RESEND_API_KEY is unset).',
            ];
        }

        $payload = [
            'from' => $this->fromHeader(),
            'to' => [$message['to']],
            'subject' => $message['subject'],
            'html' => $message['html'],
            'text' => $message['text'],
        ];

        $replyTo = $message['reply_to'] ?? (string) Env::get('MAIL_REPLY_TO', '');
        if ($replyTo !== '') {
            $payload['reply_to'] = $replyTo;
        }

        $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($encoded === false) {
            return ['ok' => false, 'status' => 0, 'error' => 'Could not encode the message.'];
        }

        $curl = curl_init(self::ENDPOINT);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . Env::get('RESEND_API_KEY', ''),
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_POSTFIELDS => $encoded,
        ]);

        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $transportError = curl_error($curl);
        curl_close($curl);

        if ($body === false) {
            return [
                'ok' => false,
                'status' => 0,
                'error' => 'Could not reach the email provider' . ($transportError !== '' ? ': ' . $transportError : '.'),
            ];
        }

        $decoded = json_decode((string) $body, true);
        $decoded = is_array($decoded) ? $decoded : [];

        if ($status >= 200 && $status < 300 && isset($decoded['id'])) {
            return ['ok' => true, 'id' => (string) $decoded['id'], 'status' => $status];
        }

        $reason = (string) ($decoded['message'] ?? 'The email provider rejected the message.');

        // The single most likely misconfiguration, worth naming precisely.
        if ($status === 403 && stripos($reason, 'domain') !== false) {
            $reason .= ' The MAIL_FROM domain must be verified in the Resend account that owns this API key.';
        }

        error_log('[tms-api] resend send failed (' . $status . '): ' . $reason);

        return ['ok' => false, 'status' => $status, 'error' => $reason];
    }
}
