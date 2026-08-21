<?php

declare(strict_types=1);

namespace Phillips\Tms\Controllers;

use Phillips\Tms\Auth\AdminRepository;
use Phillips\Tms\Auth\AuthenticatesAdmin;
use Phillips\Tms\Auth\TokenGuard;
use Phillips\Tms\Http\Request;
use Phillips\Tms\Http\Response;
use Phillips\Tms\Support\InviteEmail;
use Phillips\Tms\Support\Mailer;

/**
 * Participant administration.
 */
final class ParticipantController
{
    use AuthenticatesAdmin;

    public function __construct(
        private AdminRepository $admins = new AdminRepository(),
        private TokenGuard $tokens = new TokenGuard(),
        private Mailer $mailer = new Mailer()
    ) {
    }

    /**
     * POST /api/v1/admin/participants/invite
     *
     * Sends the invitation for real. The admin's own message is carried through
     * to the email body verbatim.
     */
    public function invite(Request $request): never
    {
        [, , $admin] = $this->authenticate($request);
        $this->requirePermission($admin, 'participants');

        $name = $request->string('name');
        $email = $request->string('email');
        $organisation = $request->string('organisation');
        $programme = $request->string('programme');
        $message = (string) $request->input('message', '');

        $errors = [];

        if ($name === '') {
            $errors['name'] = ['The participant name is required.'];
        } elseif (mb_strlen($name) > 120) {
            $errors['name'] = ['Keep the name under 120 characters.'];
        }

        if ($email === '') {
            $errors['email'] = ['An email address is required.'];
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = ['Enter a valid email address.'];
        }

        if (mb_strlen($message) > 4000) {
            $errors['message'] = ['Keep the message under 4000 characters.'];
        }

        if (mb_strlen($organisation) > 160) {
            $errors['organisation'] = ['Keep the organisation under 160 characters.'];
        }

        if ($errors !== []) {
            Response::validation($errors);
        }

        // Header injection guard: a newline in either field would let the value
        // add its own headers to the outgoing message.
        $name = self::singleLine($name);
        $email = self::singleLine($email);

        if (!$this->mailer->isConfigured()) {
            Response::error(
                'Email is not configured on this server, so the invitation was not sent.',
                503,
                ['email' => ['RESEND_API_KEY is not set.']]
            );
        }

        $payload = [
            'name' => $name,
            'organisation' => $organisation,
            'message' => $message,
            'programme' => $programme,
            'inviter' => (string) ($admin['name'] ?? ''),
        ];

        $result = $this->mailer->send([
            'to' => $email,
            'subject' => InviteEmail::subject($programme),
            'html' => InviteEmail::html($payload),
            'text' => InviteEmail::text($payload),
        ]);

        if (!$result['ok']) {
            // 502: this service is fine, the upstream provider refused.
            Response::error(
                'The invitation could not be sent: ' . ($result['error'] ?? 'unknown error'),
                502,
                ['email' => [$result['error'] ?? 'The email provider rejected the message.']]
            );
        }

        Response::ok([
            'id' => $result['id'] ?? null,
            'to' => $email,
            'from' => $this->mailer->fromHeader(),
            'participant' => [
                'name' => $name,
                'email' => $email,
                'organisation' => $organisation,
            ],
        ], 'Invitation sent to ' . $email . '.');
    }

    private static function singleLine(string $value): string
    {
        return trim(str_replace(["\r", "\n", "\t"], ' ', $value));
    }
}
