"use client";

/**
 * app/intake/[token]/page.tsx
 *
 * Public patient intake form — mobile-first, no auth required.
 * 1. Validates token → shows clinic info
 * 2. DOB verification gate → unlocks form
 * 3. 4-step wizard: Patient Info → Contact → Medical History → Chief Complaint
 * 4. Submit → success screen
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenInfo {
  clinicName: string;
  appointmentDate: string;
  appointmentType: string;
  requiresDobVerification: boolean;
}

interface PatientInfo {
  patientFirstName: string;
  patientLastName: string;
  patientDob: string;
  patientSex: string;
  phone: string | null;
  email: string | null;
}

interface FormData {
  firstName: string;
  lastName: string;
  preferredName: string;
  dob: string;
  sex: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  insuranceProvider: string;
  insuranceMemberId: string;
  insuranceGroup: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  // Medical history
  glaucoma: boolean;
  cataracts: boolean;
  macularDegeneration: boolean;
  retinalDetachment: boolean;
  lazyEye: boolean;
  eyeSurgery: boolean;
  eyeInjury: boolean;
  diabetes: boolean;
  hypertension: boolean;
  autoimmune: boolean;
  thyroid: boolean;
  heartDisease: boolean;
  currentMedications: string;
  allergies: string;
  familyOcularHistory: string;
  otherConditions: string;
  // ROS
  blurryVision: boolean;
  doubleVision: boolean;
  flashingLights: boolean;
  floaters: boolean;
  lossOfVision: boolean;
  eyePain: boolean;
  eyeRedness: boolean;
  eyeDischarge: boolean;
  eyeItching: boolean;
  dryEyes: boolean;
  tearing: boolean;
  lightSensitivity: boolean;
  headaches: boolean;
  dizziness: boolean;
  // Chief complaint
  chiefComplaint: string;
  // Consent
  consentTreatBill: boolean;
  consentPrivacyNotice: boolean;
  consentDigitalComm: boolean;
}

const INITIAL_FORM: FormData = {
  firstName: "",
  lastName: "",
  preferredName: "",
  dob: "",
  sex: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zipCode: "",
  insuranceProvider: "",
  insuranceMemberId: "",
  insuranceGroup: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelation: "",
  glaucoma: false,
  cataracts: false,
  macularDegeneration: false,
  retinalDetachment: false,
  lazyEye: false,
  eyeSurgery: false,
  eyeInjury: false,
  diabetes: false,
  hypertension: false,
  autoimmune: false,
  thyroid: false,
  heartDisease: false,
  currentMedications: "",
  allergies: "",
  familyOcularHistory: "",
  otherConditions: "",
  blurryVision: false,
  doubleVision: false,
  flashingLights: false,
  floaters: false,
  lossOfVision: false,
  eyePain: false,
  eyeRedness: false,
  eyeDischarge: false,
  eyeItching: false,
  dryEyes: false,
  tearing: false,
  lightSensitivity: false,
  headaches: false,
  dizziness: false,
  chiefComplaint: "",
  consentTreatBill: false,
  consentPrivacyNotice: false,
  consentDigitalComm: false,
};

const STEPS = ["Patient Info", "Contact & Insurance", "Medical History", "Chief Complaint"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IntakePage() {
  const { token } = useParams<{ token: string }>();

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [pageState, setPageState] = useState<
    "loading" | "dob_gate" | "form" | "submitting" | "success" | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [dobInput, setDobInput] = useState("");
  const [dobError, setDobError] = useState("");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [successDate, setSuccessDate] = useState("");

  // --- Address autocomplete state ---
  const [addressSuggestions, setAddressSuggestions] = useState<{ placeRef: string; description: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressContainerRef = useRef<HTMLDivElement>(null);

  // Validate token on mount
  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/intake/${token}`)
      .then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(d.detail || "Invalid link"));
        return r.json();
      })
      .then((data: TokenInfo) => {
        setTokenInfo(data);
        setPageState(data.requiresDobVerification ? "dob_gate" : "form");
      })
      .catch((err) => {
        setErrorMsg(typeof err === "string" ? err : "This intake link is no longer valid.");
        setPageState("error");
      });
  }, [token]);

  // DOB verification
  async function verifyDob() {
    setDobError("");
    try {
      const res = await fetch(`/api/public/intake/${token}/verify-dob`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dob: dobInput }),
      });
      if (res.status === 423) {
        setErrorMsg("Too many failed attempts. Please contact your clinic.");
        setPageState("error");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setDobError(data.detail || "Verification failed");
        return;
      }
      if (data.verified) {
        setPatientInfo(data);
        setForm((f) => ({
          ...f,
          firstName: data.patientFirstName || "",
          lastName: data.patientLastName || "",
          dob: data.patientDob || "",
          sex: data.patientSex || "",
          phone: data.phone || "",
          email: data.email || "",
        }));
        setPageState("form");
      } else {
        setDobError(`Incorrect date of birth. ${data.remainingAttempts} attempt${data.remainingAttempts === 1 ? "" : "s"} remaining.`);
      }
    } catch {
      setDobError("Something went wrong. Please try again.");
    }
  }

  // Submit form
  async function handleSubmit() {
    if (!form.chiefComplaint.trim() || !form.consentTreatBill || !form.consentPrivacyNotice) return;
    setPageState("submitting");
    try {
      const payload = {
        first_name: form.firstName,
        last_name: form.lastName,
        preferred_name: form.preferredName || null,
        dob: form.dob,
        sex: form.sex,
        phone: form.phone || null,
        email: form.email || null,
        address_line1: form.addressLine1 || null,
        address_line2: form.addressLine2 || null,
        city: form.city || null,
        state: form.state || null,
        zip_code: form.zipCode || null,
        insurance_provider: form.insuranceProvider || null,
        insurance_member_id: form.insuranceMemberId || null,
        insurance_group: form.insuranceGroup || null,
        emergency_contact_name: form.emergencyContactName || null,
        emergency_contact_phone: form.emergencyContactPhone || null,
        emergency_contact_relation: form.emergencyContactRelation || null,
        chief_complaint: form.chiefComplaint,
        medical_history: {
          glaucoma: form.glaucoma,
          cataracts: form.cataracts,
          macular_degeneration: form.macularDegeneration,
          retinal_detachment: form.retinalDetachment,
          lazy_eye: form.lazyEye,
          eye_surgery: form.eyeSurgery,
          eye_injury: form.eyeInjury,
          diabetes: form.diabetes,
          hypertension: form.hypertension,
          autoimmune: form.autoimmune,
          thyroid: form.thyroid,
          heart_disease: form.heartDisease,
          current_medications: form.currentMedications || null,
          allergies: form.allergies || null,
          family_ocular_history: form.familyOcularHistory || null,
          other_conditions: form.otherConditions || null,
        },
        review_of_systems: {
          blurry_vision: form.blurryVision,
          double_vision: form.doubleVision,
          flashing_lights: form.flashingLights,
          floaters: form.floaters,
          loss_of_vision: form.lossOfVision,
          eye_pain: form.eyePain,
          eye_redness: form.eyeRedness,
          eye_discharge: form.eyeDischarge,
          eye_itching: form.eyeItching,
          dry_eyes: form.dryEyes,
          tearing: form.tearing,
          light_sensitivity: form.lightSensitivity,
          headaches: form.headaches,
          dizziness: form.dizziness,
        },
        consent_treat_bill: form.consentTreatBill,
        consent_privacy_notice: form.consentPrivacyNotice,
        consent_digital_comm: form.consentDigitalComm,
      };

      const res = await fetch(`/api/public/intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || "Submission failed. Please try again.");
        setPageState("form");
        return;
      }
      setSuccessDate(data.appointmentDate || "");
      setPageState("success");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setPageState("form");
    }
  }

  const set = (field: keyof FormData, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  // --- Address autocomplete ---
  const handleAddressInput = useCallback((value: string) => {
    set("addressLine1", value);
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    if (value.length < 3) { setAddressSuggestions([]); setShowSuggestions(false); return; }
    addressDebounceRef.current = setTimeout(async () => {
      setAddressLoading(true);
      try {
        const res = await fetch(`/api/address/autocomplete?input=${encodeURIComponent(value)}`);
        const data = await res.json();
        setAddressSuggestions(data.suggestions || []);
        setShowSuggestions((data.suggestions || []).length > 0);
      } catch { setAddressSuggestions([]); }
      setAddressLoading(false);
    }, 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectAddress = useCallback(async (placeRef: string, description: string) => {
    setShowSuggestions(false);
    setAddressSuggestions([]);
    set("addressLine1", description.split(",")[0] || description);
    try {
      const res = await fetch(`/api/address/place-details?placeRef=${encodeURIComponent(placeRef)}`);
      const data = await res.json();
      if (data.address) {
        setForm((f) => ({
          ...f,
          addressLine1: data.address.addressLine1 || f.addressLine1,
          city: data.address.city || f.city,
          state: data.address.state || f.state,
          zipCode: data.address.zipCode || f.zipCode,
        }));
      }
    } catch { /* keep what we have */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addressContainerRef.current && !addressContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const inputClass =
    "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition";

  const checkboxRow = (label: string, field: keyof FormData) => (
    <label key={field} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
      <input
        type="checkbox"
        checked={form[field] as boolean}
        onChange={(e) => set(field, e.target.checked)}
        className="w-4 h-4 rounded border-white/20 bg-white/5 text-[var(--accent)] focus:ring-[var(--accent)]"
      />
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
    </label>
  );

  // ---------------------------------------------------------------------------
  // Page states
  // ---------------------------------------------------------------------------

  if (pageState === "loading") {
    return (
      <Shell>
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      </Shell>
    );
  }

  if (pageState === "error") {
    return (
      <Shell>
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Unable to Load Form</h2>
          <p className="text-[var(--text-secondary)]">{errorMsg}</p>
        </div>
      </Shell>
    );
  }

  if (pageState === "success") {
    return (
      <Shell>
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Thank You!</h2>
          <p className="text-[var(--text-secondary)] mb-1">Your information has been received.</p>
          {successDate && (
            <p className="text-[var(--text-secondary)]">See you on {successDate}.</p>
          )}
        </div>
      </Shell>
    );
  }

  if (pageState === "dob_gate") {
    return (
      <Shell clinicName={tokenInfo?.clinicName} appointmentDate={tokenInfo?.appointmentDate}>
        <div className="max-w-sm mx-auto">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Verify Your Identity</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Please enter your date of birth to access the intake form.
          </p>
          <input
            type="date"
            value={dobInput}
            onChange={(e) => setDobInput(e.target.value)}
            className={inputClass}
          />
          {dobError && <p className="mt-2 text-sm text-red-400">{dobError}</p>}
          <button
            onClick={verifyDob}
            disabled={!dobInput}
            className="mt-4 w-full py-2.5 rounded-lg bg-[var(--accent)] text-[var(--text-inverse)] font-medium text-sm hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Verify
          </button>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // Multi-step form
  // ---------------------------------------------------------------------------

  return (
    <Shell clinicName={tokenInfo?.clinicName} appointmentDate={tokenInfo?.appointmentDate}>
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`text-xs font-medium ${
                i === step ? "text-[var(--accent)]" : i < step ? "text-emerald-400" : "text-[var(--text-muted)]"
              }`}
            >
              {s}
            </span>
          ))}
        </div>
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step 1: Patient Info */}
      {step === 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Patient Info</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">First Name *</label>
              <input className={inputClass} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Last Name *</label>
              <input className={inputClass} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Preferred Name</label>
            <input className={inputClass} value={form.preferredName} onChange={(e) => set("preferredName", e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Date of Birth *</label>
              <input type="date" className={inputClass} value={form.dob} onChange={(e) => set("dob", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Sex *</label>
              <select className={inputClass} value={form.sex} onChange={(e) => set("sex", e.target.value)}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Contact & Insurance */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Contact Information</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Phone</label>
              <input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} type="tel" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Email</label>
              <input className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} type="email" />
            </div>
          </div>
          <div ref={addressContainerRef} className="relative">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Address</label>
            <div className="relative">
              <input
                className={inputClass}
                value={form.addressLine1}
                onChange={(e) => handleAddressInput(e.target.value)}
                onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
                placeholder="Start typing an address..."
                autoComplete="off"
              />
              {addressLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            {showSuggestions && addressSuggestions.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 rounded-lg border border-white/10 bg-[var(--glass-bg,rgba(15,15,15,0.95))] backdrop-blur-xl shadow-xl overflow-hidden">
                {addressSuggestions.map((s) => (
                  <li
                    key={s.placeRef}
                    className="px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-white/10 cursor-pointer transition"
                    onMouseDown={() => selectAddress(s.placeRef, s.description)}
                  >
                    {s.description}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <input className={inputClass} value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} placeholder="Apt, suite, unit (optional)" />
          <div className="grid grid-cols-3 gap-3">
            <input className={inputClass} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="City" />
            <input className={inputClass} value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="State" />
            <input className={inputClass} value={form.zipCode} onChange={(e) => set("zipCode", e.target.value)} placeholder="ZIP" />
          </div>

          <h3 className="text-base font-semibold text-[var(--text-primary)] pt-2">Insurance</h3>
          <input className={inputClass} value={form.insuranceProvider} onChange={(e) => set("insuranceProvider", e.target.value)} placeholder="Insurance provider" />
          <div className="grid grid-cols-2 gap-3">
            <input className={inputClass} value={form.insuranceMemberId} onChange={(e) => set("insuranceMemberId", e.target.value)} placeholder="Member ID" />
            <input className={inputClass} value={form.insuranceGroup} onChange={(e) => set("insuranceGroup", e.target.value)} placeholder="Group #" />
          </div>

          <h3 className="text-base font-semibold text-[var(--text-primary)] pt-2">Emergency Contact</h3>
          <input className={inputClass} value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} placeholder="Contact name" />
          <div className="grid grid-cols-2 gap-3">
            <input className={inputClass} value={form.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} placeholder="Phone" type="tel" />
            <input className={inputClass} value={form.emergencyContactRelation} onChange={(e) => set("emergencyContactRelation", e.target.value)} placeholder="Relationship" />
          </div>
        </div>
      )}

      {/* Step 3: Medical History & ROS */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Ocular History</h3>
          <div className="grid grid-cols-2 gap-x-4">
            {checkboxRow("Glaucoma", "glaucoma")}
            {checkboxRow("Cataracts", "cataracts")}
            {checkboxRow("Macular Degeneration", "macularDegeneration")}
            {checkboxRow("Retinal Detachment", "retinalDetachment")}
            {checkboxRow("Lazy Eye (Amblyopia)", "lazyEye")}
            {checkboxRow("Eye Surgery", "eyeSurgery")}
            {checkboxRow("Eye Injury", "eyeInjury")}
          </div>

          <h3 className="text-base font-semibold text-[var(--text-primary)] pt-2">Systemic Conditions</h3>
          <div className="grid grid-cols-2 gap-x-4">
            {checkboxRow("Diabetes", "diabetes")}
            {checkboxRow("Hypertension", "hypertension")}
            {checkboxRow("Autoimmune Disease", "autoimmune")}
            {checkboxRow("Thyroid Disorder", "thyroid")}
            {checkboxRow("Heart Disease", "heartDisease")}
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Current Medications</label>
            <textarea className={inputClass} rows={2} value={form.currentMedications} onChange={(e) => set("currentMedications", e.target.value)} placeholder="List current medications" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Allergies</label>
            <textarea className={inputClass} rows={2} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="Drug or other allergies" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Family Ocular History</label>
            <textarea className={inputClass} rows={2} value={form.familyOcularHistory} onChange={(e) => set("familyOcularHistory", e.target.value)} placeholder="Family eye conditions" />
          </div>

          <h3 className="text-base font-semibold text-[var(--text-primary)] pt-2">Review of Systems</h3>
          <p className="text-xs text-[var(--text-muted)] -mt-2">Check any symptoms you are currently experiencing:</p>
          <div className="grid grid-cols-2 gap-x-4">
            {checkboxRow("Blurry Vision", "blurryVision")}
            {checkboxRow("Double Vision", "doubleVision")}
            {checkboxRow("Flashing Lights", "flashingLights")}
            {checkboxRow("Floaters", "floaters")}
            {checkboxRow("Loss of Vision", "lossOfVision")}
            {checkboxRow("Eye Pain", "eyePain")}
            {checkboxRow("Eye Redness", "eyeRedness")}
            {checkboxRow("Eye Discharge", "eyeDischarge")}
            {checkboxRow("Eye Itching", "eyeItching")}
            {checkboxRow("Dry Eyes", "dryEyes")}
            {checkboxRow("Tearing", "tearing")}
            {checkboxRow("Light Sensitivity", "lightSensitivity")}
            {checkboxRow("Headaches", "headaches")}
            {checkboxRow("Dizziness", "dizziness")}
          </div>
        </div>
      )}

      {/* Step 4: Chief Complaint */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Reason for Visit</h3>
          <p className="text-sm text-[var(--text-secondary)] -mt-2">
            Please describe the main reason for your appointment.
          </p>
          <textarea
            className={inputClass}
            rows={4}
            value={form.chiefComplaint}
            onChange={(e) => set("chiefComplaint", e.target.value)}
            placeholder="What brings you in today?"
          />
          {form.otherConditions === "" && (
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Anything else we should know?</label>
              <textarea
                className={inputClass}
                rows={2}
                value={form.otherConditions}
                onChange={(e) => set("otherConditions", e.target.value)}
                placeholder="Optional"
              />
            </div>
          )}

          {/* Consent & Acknowledgments */}
          <div className="mt-6 pt-5 border-t border-white/8">
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">Consent & Acknowledgments</h3>

            <label className="flex items-start gap-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.consentTreatBill}
                onChange={(e) => set("consentTreatBill", e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-white/20 bg-white/5 text-[var(--accent)] focus:ring-[var(--accent)] flex-shrink-0"
              />
              <span className="text-sm text-[var(--text-secondary)] leading-relaxed">
                <span className="inline-flex items-center gap-1.5 mb-0.5">
                  <span className="font-medium text-[var(--text-primary)]">Consent to Treat & Bill</span>
                  <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Required</span>
                </span>
                <br />
                I consent to optometric evaluation and treatment by the doctors and staff of {tokenInfo?.clinicName || "this clinic"}. I authorize the release of any medical information necessary to process my insurance claims and assign my insurance benefits directly to the clinic.
              </span>
            </label>

            <label className="flex items-start gap-3 py-3 border-t border-white/5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.consentPrivacyNotice}
                onChange={(e) => set("consentPrivacyNotice", e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-white/20 bg-white/5 text-[var(--accent)] focus:ring-[var(--accent)] flex-shrink-0"
              />
              <span className="text-sm text-[var(--text-secondary)] leading-relaxed">
                <span className="inline-flex items-center gap-1.5 mb-0.5">
                  <span className="font-medium text-[var(--text-primary)]">Notice of Privacy Practices (HIPAA & CMIA)</span>
                  <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Required</span>
                </span>
                <br />
                I acknowledge that I have received or been offered a copy of this clinic&apos;s Notice of Privacy Practices, which details how my medical information may be used and disclosed under federal (HIPAA) and California state law (CMIA).
              </span>
            </label>

            <label className="flex items-start gap-3 py-3 border-t border-white/5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.consentDigitalComm}
                onChange={(e) => set("consentDigitalComm", e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-white/20 bg-white/5 text-[var(--accent)] focus:ring-[var(--accent)] flex-shrink-0"
              />
              <span className="text-sm text-[var(--text-secondary)] leading-relaxed">
                <span className="inline-flex items-center gap-1.5 mb-0.5">
                  <span className="font-medium text-[var(--text-primary)]">Digital Communication Consent</span>
                  <span className="text-[10px] font-medium text-[var(--text-muted)] bg-white/5 px-1.5 py-0.5 rounded">Optional</span>
                </span>
                <br />
                I consent to receive non-secure digital communications (such as SMS text messages and unencrypted emails) regarding my appointments, intake forms, and optical orders. I understand that unencrypted communication carries a small risk of interception.
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex-1 py-2.5 rounded-lg border border-white/10 text-[var(--text-secondary)] text-sm font-medium hover:bg-white/5 transition"
          >
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 0 && (!form.firstName || !form.lastName || !form.dob || !form.sex)}
            className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] text-[var(--text-inverse)] text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!form.chiefComplaint.trim() || !form.consentTreatBill || !form.consentPrivacyNotice || pageState === "submitting"}
            className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] text-[var(--text-inverse)] text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {pageState === "submitting" ? "Submitting..." : "Submit"}
          </button>
        )}
      </div>

      {errorMsg && pageState === "form" && (
        <p className="mt-3 text-sm text-red-400 text-center">{errorMsg}</p>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Shell — page wrapper (no sidebar, no TopNav)
// ---------------------------------------------------------------------------

function Shell({
  children,
  clinicName,
  appointmentDate,
}: {
  children: React.ReactNode;
  clinicName?: string;
  appointmentDate?: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Ambient gradient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[var(--accent)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          {clinicName && (
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">{clinicName}</h1>
          )}
          <p className="text-sm text-[var(--text-secondary)]">Patient Intake Form</p>
          {appointmentDate && (
            <p className="text-xs text-[var(--text-muted)] mt-1">{appointmentDate}</p>
          )}
        </div>

        {/* Content card */}
        <div className="rounded-xl border border-white/8 bg-[var(--bg-surface)] p-6 shadow-lg">
          {children}
        </div>

        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          Your information is encrypted and protected under HIPAA.
        </p>
      </div>
    </div>
  );
}
