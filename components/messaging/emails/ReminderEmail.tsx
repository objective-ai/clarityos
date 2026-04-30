import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

export interface ReminderEmailProps {
  patientFirstName: string;
  apptDate: string;
  apptTime: string;
  providerName: string;
  clinicName: string;
  confirmLink: string;
  rescheduleLink: string;
  language?: "en" | "es";
}

const enStrings = {
  preview: (clinic: string, d: string, t: string) =>
    `${clinic} eye exam reminder for ${d} at ${t}`,
  heading: (clinic: string) => `Appointment Reminder — ${clinic}`,
  greeting: (name: string) => `Hi ${name},`,
  body: (d: string, t: string, p: string) =>
    `This is a reminder of your eye exam on ${d} at ${t} with ${p}.`,
  confirm: "Confirm Appointment",
  reschedule: "Need to reschedule?",
};

const esStrings = {
  preview: (clinic: string, d: string, t: string) =>
    `Recordatorio de examen visual en ${clinic} para ${d} a las ${t}`,
  heading: (clinic: string) => `Recordatorio de Cita — ${clinic}`,
  greeting: (name: string) => `Hola ${name},`,
  body: (d: string, t: string, p: string) =>
    `Le recordamos su examen visual el ${d} a las ${t} con ${p}.`,
  confirm: "Confirmar Cita",
  reschedule: "¿Necesita reprogramar?",
};

export const ReminderEmail = ({
  patientFirstName,
  apptDate,
  apptTime,
  providerName,
  clinicName,
  confirmLink,
  rescheduleLink,
  language = "en",
}: ReminderEmailProps) => {
  const t = language === "es" ? esStrings : enStrings;
  return (
    <Html>
      <Head />
      <Preview>{t.preview(clinicName, apptDate, apptTime)}</Preview>
      <Body
        style={{
          fontFamily: "-apple-system,Segoe UI,sans-serif",
          backgroundColor: "#f8fafc",
        }}
      >
        <Container style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
          <Heading as="h1" style={{ fontSize: 20, color: "#0f172a" }}>
            {t.heading(clinicName)}
          </Heading>
          <Text style={{ fontSize: 14, color: "#0f172a" }}>
            {t.greeting(patientFirstName)}
          </Text>
          <Text style={{ fontSize: 14, color: "#0f172a" }}>
            {t.body(apptDate, apptTime, providerName)}
          </Text>
          <Section style={{ marginTop: 24 }}>
            <Button
              href={confirmLink}
              style={{
                backgroundColor: "#2DD4BF",
                color: "#0f172a",
                padding: "12px 20px",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              {t.confirm}
            </Button>
            <Text style={{ fontSize: 12, marginTop: 16 }}>
              <a href={rescheduleLink} style={{ color: "#2563EB" }}>
                {t.reschedule}
              </a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default ReminderEmail;
