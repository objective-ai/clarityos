import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import * as React from "react";

export interface ManualEmailProps {
  subject: string;
  body: string;
  clinicName: string;
}

export const ManualEmail = ({ subject, body, clinicName }: ManualEmailProps) => {
  const lines = body.split(/\r?\n/);
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body
        style={{
          fontFamily: "-apple-system,Segoe UI,sans-serif",
          backgroundColor: "#f8fafc",
        }}
      >
        <Container style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
          <Heading as="h1" style={{ fontSize: 18, color: "#0f172a" }}>
            {subject}
          </Heading>
          {lines.map((line, idx) => (
            <Text
              key={idx}
              style={{
                fontSize: 14,
                color: "#0f172a",
                margin: line.trim() === "" ? "8px 0" : "4px 0",
              }}
            >
              {line || " "}
            </Text>
          ))}
          <Text style={{ fontSize: 12, color: "#64748b", marginTop: 24 }}>
            — {clinicName}
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default ManualEmail;
