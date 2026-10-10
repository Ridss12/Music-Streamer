import smtplib
from email.message import EmailMessage

from app.config import (
    EMAIL_HOST,
    EMAIL_PORT,
    EMAIL_USERNAME,
    EMAIL_PASSWORD
)


def send_password_reset_otp(
    recipient_email: str,
    otp: str
):
    message = EmailMessage()

    message["Subject"] = "Rivibe Password Reset OTP"
    message["From"] = EMAIL_USERNAME
    message["To"] = recipient_email

    message.set_content(
        f"""
Hello,

We received a request to reset your Rivibe password.

Your password reset OTP is:

{otp}

This OTP will expire in 5 minutes.

If you did not request a password reset, you can ignore this email.

Regards,
Rivibe Team
"""
    )

    with smtplib.SMTP(
        EMAIL_HOST,
        EMAIL_PORT
    ) as server:

        server.starttls()

        server.login(
            EMAIL_USERNAME,
            EMAIL_PASSWORD
        )

        server.send_message(message)