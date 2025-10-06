export type SendEmailInput = {
  userEmail: string;
  userName: string;
  imageUrl: string; // URL final ya generada
};

export async function sendEmail({ userEmail, userName, imageUrl }: SendEmailInput) {
  const res = await fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userEmail, userName, imageUrl }),
  });

  // Manejo de error claro para el UI
  if (!res.ok) {
    let message = "Unknown error";
    try {
      const data = await res.json();
      message = data?.error || JSON.stringify(data);
    } catch {}
    throw new Error(message);
  }

  return res.json(); // { success: true, ... }
}