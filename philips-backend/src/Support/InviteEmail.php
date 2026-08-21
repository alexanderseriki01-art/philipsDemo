<?php

declare(strict_types=1);

namespace Phillips\Tms\Support;

/**
 * Builds the participant invitation, in HTML and a plain-text alternative.
 *
 * Table-based layout with inline styles on purpose: email clients strip <style>
 * blocks and have no reliable flex or grid support.
 */
final class InviteEmail
{
    public static function subject(string $programme = ''): string
    {
        return $programme !== ''
            ? 'Your invitation to ' . $programme
            : 'Your Phillips Consulting training invitation';
    }

    /**
     * @param array{name: string, organisation?: string, message?: string, programme?: string, inviter?: string} $data
     */
    public static function html(array $data): string
    {
        $name = self::e((string) ($data['name'] ?? ''));
        $inviter = self::e((string) ($data['inviter'] ?? ''));
        $message = (string) ($data['message'] ?? '');
        $portal = (string) Env::get('PORTAL_URL', 'https://philips-demo.vercel.app');
        $registerUrl = rtrim($portal, '/') . '/register/';

        // The admin's own words, kept as written. Escaped, then only newlines
        // are turned into markup so pasted text keeps its paragraphing.
        $messageBlock = '';
        if (trim($message) !== '') {
            $paragraphs = preg_split('/\n{2,}/', trim($message)) ?: [];
            $rendered = '';
            foreach ($paragraphs as $paragraph) {
                $rendered .= '<p style="margin:0 0 14px;">'
                    . nl2br(self::e(trim($paragraph)))
                    . '</p>';
            }
            $messageBlock = '
            <tr>
              <td style="padding:0 40px 8px;">
                <div style="border-left:3px solid #1f54d4;background:#f5f8ff;padding:18px 20px;border-radius:0 8px 8px 0;font-size:15px;line-height:1.62;color:#1b2c4a;">
                  ' . $rendered . '
                </div>
              </td>
            </tr>';
        }

        $signOff = $inviter !== ''
            ? $inviter . '<br /><span style="color:#6c7d99;">Phillips Consulting</span>'
            : 'Phillips Consulting';

        return '<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>' . self::e(self::subject()) . '</title>
</head>
<body style="margin:0;padding:0;background:#f3f6fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="max-width:600px;background:#ffffff;border:1px solid #e3eaf3;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;">

          <tr>
            <td style="background:#071730;padding:26px 40px;">
              <div style="font-size:21px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;">
                phillips<span style="color:#5a8eff;">.</span>
              </div>
              <div style="font-size:9px;letter-spacing:0.34em;color:rgba(255,255,255,0.66);margin-top:5px;">
                CONSULTING
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 40px 14px;">
              <h1 style="margin:0 0 14px;font-size:23px;line-height:1.25;color:#0a1b34;font-weight:600;letter-spacing:-0.02em;">
                You have been invited to train with us.
              </h1>
              <p style="margin:0;font-size:15px;line-height:1.62;color:#4a5b78;">
                Hello ' . ($name !== '' ? $name : 'there') . ',
              </p>
            </td>
          </tr>
' . $messageBlock . '
          <tr>
            <td style="padding:14px 40px 4px;">
              <p style="margin:0;font-size:15px;line-height:1.62;color:#4a5b78;">
                Set up your account to see your programme details, materials, attendance record and certificates in one place.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 40px 8px;">
              <a href="' . self::e($registerUrl) . '"
                 style="display:inline-block;background:#1f54d4;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 30px;border-radius:50px;">
                Activate your account
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 40px 32px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#8c9bb4;">
                If the button does not work, copy this link into your browser:<br />
                <a href="' . self::e($registerUrl) . '" style="color:#1f54d4;">' . self::e($registerUrl) . '</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 34px;">
              <p style="margin:0;font-size:15px;line-height:1.62;color:#4a5b78;">
                Regards,<br />' . $signOff . '
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#fafbfd;border-top:1px solid #e3eaf3;padding:18px 40px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#8c9bb4;">
                You are receiving this because a Phillips Consulting administrator invited you to a training programme.
                If this was not meant for you, please ignore it.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>';
    }

    /**
     * @param array{name: string, organisation?: string, message?: string, inviter?: string} $data
     */
    public static function text(array $data): string
    {
        $name = trim((string) ($data['name'] ?? ''));
        $message = trim((string) ($data['message'] ?? ''));
        $inviter = trim((string) ($data['inviter'] ?? ''));
        $portal = (string) Env::get('PORTAL_URL', 'https://philips-demo.vercel.app');
        $registerUrl = rtrim($portal, '/') . '/register/';

        $lines = [];
        $lines[] = 'Hello ' . ($name !== '' ? $name : 'there') . ',';
        $lines[] = '';

        if ($message !== '') {
            $lines[] = $message;
            $lines[] = '';
        }

        $lines[] = 'Set up your account to see your programme details, materials, attendance record and certificates in one place.';
        $lines[] = '';
        $lines[] = 'Activate your account: ' . $registerUrl;
        $lines[] = '';
        $lines[] = 'Regards,';
        $lines[] = $inviter !== '' ? $inviter : 'Phillips Consulting';
        if ($inviter !== '') {
            $lines[] = 'Phillips Consulting';
        }
        $lines[] = '';
        $lines[] = 'You are receiving this because a Phillips Consulting administrator invited you to a training programme.';

        return implode("\n", $lines);
    }

    private static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
