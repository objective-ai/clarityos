/**
 * lib/scribe-scenarios.ts
 *
 * All 6 AI Scribe test scenarios with transcript text and expected structured output.
 * Used in the Admin → Demo Data section for quick scenario previewing.
 */

export interface ScribeExpectedOutput {
  chiefComplaint: string;
  vitals?: {
    iopOd?: number;
    iopOs?: number;
    vaOdDistance?: string;
    vaOsDistance?: string;
    vaOdNear?: string;
    vaOsNear?: string;
    bpSystolic?: number;
    bpDiastolic?: number;
  };
  refraction?: {
    od?: { sphere: string; cylinder?: string; axis?: number; add?: string };
    os?: { sphere: string; cylinder?: string; axis?: number; add?: string };
  };
  anteriorFindings?: { od: string; os: string };
  posteriorFindings?: { od: string; os: string };
  diagnoses: { icdCode: string; description: string; laterality: string }[];
  plan: string;
  additionalNotes?: string;
}

export interface ScribeScenario {
  id: string;
  name: string;
  description: string;
  transcript: string;
  expected: ScribeExpectedOutput;
}

export const SCRIBE_SCENARIOS: ScribeScenario[] = [
  {
    id: "routine-contact-lens",
    name: "1. Routine Contact Lens",
    description:
      "Most common visit type — normal findings with a simple Rx change.",
    transcript:
      "Hi, good to see you. Vision is a bit blurry with your current contacts at the computer? Okay. Your pressure is 14 in the right and 13 in the left, which is perfect. Looking at your eyes, everything is healthy and clear. Your new prescription is minus 3.50 in the right and minus 3.00 in the left. No changes to the astigmatism.",
    expected: {
      chiefComplaint: "Blurry vision with contacts at computer",
      vitals: { iopOd: 14, iopOs: 13 },
      refraction: {
        od: { sphere: "-3.50" },
        os: { sphere: "-3.00" },
      },
      anteriorFindings: { od: "Normal", os: "Normal" },
      posteriorFindings: { od: "Normal", os: "Normal" },
      diagnoses: [
        { icdCode: "H52.11", description: "Myopia, right eye", laterality: "OD" },
        { icdCode: "H52.12", description: "Myopia, left eye", laterality: "OS" },
      ],
      plan: "Updated contact lens Rx dispensed.",
    },
  },
  {
    id: "glaucoma-suspect",
    name: "2. Glaucoma Suspect",
    description:
      "Chronic disease monitoring — elevated IOP, optic nerve findings, medications, follow-up.",
    transcript:
      "So your pressures are a bit high today at 24 and 23. Are you taking your Latanoprost every night? Your nerves look a little thinner than last time, especially on the right side. I see a cup-to-disc ratio of about 0.70. We're going to keep the diagnosis as glaucoma suspect but I want you to come back in three months for a visual field test.",
    expected: {
      chiefComplaint: "Glaucoma suspect follow-up",
      vitals: { iopOd: 24, iopOs: 23 },
      posteriorFindings: {
        od: "Optic nerve thinning, C/D ratio 0.70",
        os: "C/D ratio within normal limits",
      },
      diagnoses: [
        {
          icdCode: "H40.001",
          description: "Glaucoma suspect, right eye",
          laterality: "OD",
        },
        {
          icdCode: "H40.002",
          description: "Glaucoma suspect, left eye",
          laterality: "OS",
        },
      ],
      plan: "Continue Latanoprost QHS. Visual field test in 3 months.",
      additionalNotes: "Medication: Latanoprost (nightly)",
    },
  },
  {
    id: "corneal-abrasion",
    name: "3. Corneal Abrasion",
    description:
      "Acute injury — single-eye findings, laterality, measurements, treatment plan.",
    transcript:
      "So that right eye looks very painful. You've got a lot of redness. I see a small scratch on the surface of the cornea, about 3 millimeters wide. It's a corneal abrasion. I'm going to prescribe some antibiotic drops and a bandage contact lens. No foreign body found.",
    expected: {
      chiefComplaint: "Right eye pain and redness",
      anteriorFindings: {
        od: "Corneal abrasion (3mm), conjunctival injection, no foreign body",
        os: "Normal",
      },
      diagnoses: [
        {
          icdCode: "S05.01XA",
          description: "Corneal abrasion, right eye, initial encounter",
          laterality: "OD",
        },
      ],
      plan: "Antibiotic drops + bandage contact lens OD. Follow-up 24-48 hours.",
    },
  },
  {
    id: "diabetic-retinopathy",
    name: "4. Diabetic Retinopathy",
    description:
      "Complex visit — bilateral retinal findings, co-management referral, VA extraction.",
    transcript:
      "So I'm seeing some changes in the back of your eyes related to your diabetes. There are a few small dot hemorrhages and microaneurysms in both eyes, more so on the right. No macular edema though, which is good. Your vision is still 20/25 in each eye. I'm going to diagnose this as mild nonproliferative diabetic retinopathy in both eyes and I want to send these photos to your primary care doctor. Let's recheck in six months.",
    expected: {
      chiefComplaint: "Diabetic eye exam",
      vitals: { vaOdDistance: "20/25", vaOsDistance: "20/25" },
      posteriorFindings: {
        od: "Dot hemorrhages, microaneurysms (more prominent), no macular edema",
        os: "Dot hemorrhages, microaneurysms, no macular edema",
      },
      diagnoses: [
        {
          icdCode: "E11.3211",
          description: "Mild nonproliferative diabetic retinopathy, right eye",
          laterality: "OD",
        },
        {
          icdCode: "E11.3212",
          description: "Mild nonproliferative diabetic retinopathy, left eye",
          laterality: "OS",
        },
      ],
      plan: "Fundus photos to PCP. Recheck in 6 months. No treatment needed at this time.",
    },
  },
  {
    id: "comprehensive-new-patient",
    name: "5. Comprehensive New Patient",
    description:
      "Hardest scenario — multiple concurrent diagnoses (Rx + dry eye + early cataract).",
    transcript:
      "So for your new glasses, you're minus 2.25 with minus 0.75 cylinder at 180 in the right, and minus 2.00 with minus 0.50 at 175 in the left. Add plus 1.50 both eyes for reading. Your eyes are pretty dry \u2014 I see some punctate staining on both corneas. I'd recommend artificial tears four times a day. Also, I'm noticing the very beginning of cataracts in both lenses, grade one nuclear sclerosis. Nothing to worry about yet but we'll keep an eye on it. Pressures are 16 and 15, nice and normal.",
    expected: {
      chiefComplaint: "New patient comprehensive exam",
      vitals: { iopOd: 16, iopOs: 15 },
      refraction: {
        od: { sphere: "-2.25", cylinder: "-0.75", axis: 180, add: "+1.50" },
        os: { sphere: "-2.00", cylinder: "-0.50", axis: 175, add: "+1.50" },
      },
      anteriorFindings: {
        od: "Corneal punctate staining, lens: grade 1 nuclear sclerosis",
        os: "Corneal punctate staining, lens: grade 1 nuclear sclerosis",
      },
      diagnoses: [
        {
          icdCode: "H52.11",
          description: "Myopia with astigmatism",
          laterality: "OU",
        },
        {
          icdCode: "H04.123",
          description: "Dry eye syndrome",
          laterality: "OU",
        },
        {
          icdCode: "H25.09",
          description: "Age-related incipient cataract",
          laterality: "OU",
        },
      ],
      plan: "New glasses Rx dispensed. Artificial tears QID. Monitor cataracts annually.",
    },
  },
  {
    id: "pediatric-binocular",
    name: "6. Pediatric / Binocular Vision",
    description:
      "Pediatric-specific — accommodation, convergence testing, vision therapy plan.",
    transcript:
      "So your child is having trouble reading at school and getting headaches after about 20 minutes. Their distance vision is 20/20 in each eye which is great. But when I test how well their eyes focus up close, their accommodative amplitude is only about 5 diopters which is low for their age. And their convergence is receding to about 15 centimeters. I'm going to diagnose convergence insufficiency and accommodative insufficiency. I'd like to start vision therapy twice a week.",
    expected: {
      chiefComplaint: "Trouble reading, headaches after 20 min",
      vitals: { vaOdDistance: "20/20", vaOsDistance: "20/20" },
      diagnoses: [
        {
          icdCode: "H51.11",
          description: "Convergence insufficiency",
          laterality: "OU",
        },
        {
          icdCode: "H52.521",
          description: "Accommodative insufficiency",
          laterality: "OU",
        },
      ],
      plan: "Vision therapy 2x/week. Recheck in 8-12 weeks.",
      additionalNotes:
        "Accommodative amplitude: 5D (low for age). NPC: 15cm (receded).",
    },
  },
];
