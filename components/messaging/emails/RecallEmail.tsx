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

export interface RecallEmailProps {
  patientFirstName: string;
  clinicName: string;
  confirmLink: string;
  language?: "en" | "es";
}

const enStrings = {
  preview: (clinic: string) => `Time for your annual eye exam — ${clinic}`,
  heading: (clinic: string) => `Time for your annual eye exam — ${clinic}`,
  greeting: (name: string) => `Hi ${name},`,
  body:
    "It's been a year since your last eye exam. Schedule your annual checkup to keep your vision sharp and your eyes healthy.",
  cta: "Book Now",
};

const esStrings = {
  preview: (clinic: string) => `Es hora de su examen visual anual — ${clinic}`,
  heading: (clinic: string) => `Es hora de su examen visual anual — ${clinic}`,
  greeting: (name: string) => `Hola ${name},`,
  body:
    "Ha pasado un año desde su último examen visual. Reserve su revisión anual para mantener su vista en buen estado.",
  cta: "Reservar Ahora",
};

export const RecallEmail = ({
  patientFirstName,
  clinicName,
  confirmLink,
  language = "en",
}: RecallEmailProps) => {
  const t = language === "es" ? esStrings : enStrings;
  return (
    <Html>
      <Head />
      <Preview>{t.preview(clinicName)}</Preview>
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
          <Text style={{ fontSize: 14, color: "#0f172a" }}>{t.body}</Text>
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
              {t.cta}
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default RecallEmail;
