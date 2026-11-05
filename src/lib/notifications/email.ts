import { recordEmailNotification } from "../db/repository";
import type { EmailNotificationRecord } from "../db/types";

export interface SendAccountNotificationInput {
  recipientEmail: string;
  recipientName: string;
  studentId: string;
  notificationType: "account_blocked" | "account_unblocked" | "role_updated";
  reason?: string | null;
  newRole?: "student" | "admin";
  triggeredByEmail: string;
}

export async function sendAccountStatusEmailNotification(
  input: SendAccountNotificationInput
): Promise<EmailNotificationRecord> {
  const cleanEmail = input.recipientEmail.trim().toLowerCase();
  let subject = "";
  let bodyText = "";

  if (input.notificationType === "account_blocked") {
    const reasonLine = input.reason?.trim() || "Violation of platform policies / Administrative action.";
    subject = "Important Notice: Your StudyMate AI Account Has Been Blocked";
    bodyText = [
      `Hello ${input.recipientName} (${input.studentId}),`,
      "",
      `Your StudyMate AI account (${cleanEmail}) has been blocked by the SuperAdmin (${input.triggeredByEmail}).`,
      "",
      `Reason: ${reasonLine}`,
      `Timestamp: ${new Date().toUTCString()}`,
      "",
      "While your account is blocked, you cannot sign in or access StudyMate AI services.",
      "If you believe this was a mistake, please contact the SuperAdmin at amrendrayadav03321@gmail.com.",
      "",
      "— StudyMate AI Security (Design and Build by Team Tricksters)",
    ].join("\n");
  } else if (input.notificationType === "account_unblocked") {
    subject = "Good News: Your StudyMate AI Account Has Been Unblocked";
    bodyText = [
      `Hello ${input.recipientName} (${input.studentId}),`,
      "",
      `Your StudyMate AI account (${cleanEmail}) has been unblocked by the SuperAdmin (${input.triggeredByEmail}).`,
      "You can now sign in again using your Google Account and PIN.",
      "",
      "— StudyMate AI Security (Design and Build by Team Tricksters)",
    ].join("\n");
  } else {
    const roleLabel = input.newRole === "admin" ? "Administrator (Admin Dashboard Access Granted)" : "Student (Admin Access Revoked)";
    subject = `StudyMate AI Account Role Updated: ${roleLabel}`;
    bodyText = [
      `Hello ${input.recipientName} (${input.studentId}),`,
      "",
      `Your StudyMate AI account (${cleanEmail}) role has been updated by the SuperAdmin (${input.triggeredByEmail}).`,
      `New Role: ${roleLabel}`,
      "",
      "— StudyMate AI Security (Design and Build by Team Tricksters)",
    ].join("\n");
  }

  const mailtoUrl = `mailto:${encodeURIComponent(cleanEmail)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(bodyText)}`;
  const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    cleanEmail
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;

  let deliveryStatus: EmailNotificationRecord["delivery_status"] =
    "queued_for_mailto_and_logged";
  let providerMessage =
    "Notification logged in SuperAdmin Dispatch Center and ready for instant delivery.";

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress =
    process.env.SMTP_FROM?.trim() || "StudyMate AI Security <onboarding@resend.dev>";
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL?.trim();

  if (resendApiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [cleanEmail],
          subject,
          text: bodyText,
        }),
      });

      if (response.ok) {
        deliveryStatus = "sent_via_provider";
        providerMessage = `Email delivered to ${cleanEmail} via Resend API.`;
      } else {
        const errText = await response.text();
        providerMessage = `Resend API returned ${response.status}: ${errText.slice(0, 120)}`;
      }
    } catch (err) {
      providerMessage = `Resend network error: ${err instanceof Error ? err.message : "Unknown"}`;
    }
  } else if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: cleanEmail,
          recipientName: input.recipientName,
          subject,
          text: bodyText,
          notificationType: input.notificationType,
        }),
      });
      if (response.ok) {
        deliveryStatus = "sent_via_provider";
        providerMessage = `Email delivered to ${cleanEmail} via configured Email Webhook.`;
      }
    } catch {
      // Fallback to logged + Gmail compose link
    }
  }

  return recordEmailNotification({
    recipient_email: cleanEmail,
    recipient_name: input.recipientName,
    subject,
    body_text: bodyText,
    notification_type: input.notificationType,
    delivery_status: deliveryStatus,
    provider_message: providerMessage,
    mailto_url: mailtoUrl,
    gmail_compose_url: gmailComposeUrl,
    triggered_by_email: input.triggeredByEmail,
  });
}
