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
  {
    id: "standard-annual",
    name: "7. Standard Annual (All Normal)",
    description:
      "Tests WNL mapping — all findings normal, spoken Rx numbers (e.g., 'minus one-fifty').",
    transcript: `Alright, let's get started with your annual. Any changes? No? Great. Patient is here for a routine checkup. Vision is 20/20 in both eyes uncorrected at distance. Pressures look good, let's see... 14 in the right and 15 in the left using the iCare.

Looking at the front of the eye now. Lids and lashes are clear. Conjunctiva is white and quiet. Corneas are nice and clear OU. Anterior chamber is deep and quiet, no cells or flare. Iris is flat and brown. Lens is clear, no signs of cataracts.

Moving to the back. Cup to disc ratio is a healthy 0.3 in both eyes. Nerves are pink and well-rimmed. Macula is flat, no edema. Vessels look great, standard A/V ratio. Periphery is totally intact, no holes or tears 360.

Refraction today is just a tiny bit of nearsightedness. OD is minus one-fifty sphere, OS is minus one-seventy-five sphere. No astigmatism. No change to your plan, just come back and see me in a year.`,
    expected: {
      chiefComplaint: "Routine annual eye examination",
      vitals: { iopOd: 14, iopOs: 15, vaOdDistance: "20/20", vaOsDistance: "20/20" },
      refraction: {
        od: { sphere: "-1.50" },
        os: { sphere: "-1.75" },
      },
      anteriorFindings: {
        od: "Normal — lids, conjunctiva, cornea, AC, iris, lens clear",
        os: "Normal",
      },
      posteriorFindings: {
        od: "C/D 0.3, pink nerve, flat macula, intact periphery 360°",
        os: "Same as OD",
      },
      diagnoses: [
        { icdCode: "H52.13", description: "Myopia, bilateral", laterality: "OU" },
      ],
      plan: "No Rx change. Return in 12 months.",
      additionalNotes: "IOP by iCare.",
    },
  },
  {
    id: "pathology-case",
    name: "8. Pathology Case (Multi-Diagnosis)",
    description:
      "Tests spoken Rx normalization ('minus one-twenty-five axis ninety') and multi-diagnosis extraction (dry eye, cataract, AMD).",
    transcript: `Patient is presenting with significant dry eye and blurry near vision. Entering VAs with current glasses are 20/40 OD and 20/40 OS. At near, they are struggling at J5. Pressures are a bit elevated at 21 in the right and 20 in the left.

Slit lamp shows some issues. Lids have trace blepharitis. The tear film is very unstable, high debris. Corneas show 2+ punctate epithelial staining, mostly inferiorly in both eyes. AC is clear. The lens is showing some early changes, Grade 1 nuclear sclerosis in both eyes.

In the back, the nerves look okay, C/D is 0.4. But I'm seeing some drusen in the macula OU, very early dry AMD changes.

Manifest refraction: Right eye is minus two-fifty, minus one-twenty-five axis ninety. Left eye is minus two-seventy-five, minus one-zero-zero axis eighty-five. We're adding a plus two-zero-zero for reading.

Assessment is dry eye syndrome, early cataracts, and mild dry macular degeneration. Start using Refresh tears four times a day and let's get you into some high-quality bifocal lenses. Follow up in six months.`,
    expected: {
      chiefComplaint: "Dry eye and blurry near vision",
      vitals: { iopOd: 21, iopOs: 20, vaOdDistance: "20/40", vaOsDistance: "20/40" },
      refraction: {
        od: { sphere: "-2.50", cylinder: "-1.25", axis: 90 },
        os: { sphere: "-2.75", cylinder: "-1.00", axis: 85, add: "+2.00" },
      },
      anteriorFindings: {
        od: "Trace blepharitis; unstable tear film with debris; 2+ SPK inferior; Grade 1 nuclear sclerosis",
        os: "Same as OD",
      },
      posteriorFindings: {
        od: "C/D 0.4; drusen present — early dry AMD",
        os: "Same as OD",
      },
      diagnoses: [
        { icdCode: "H04.123", description: "Dry eye syndrome, bilateral", laterality: "OU" },
        {
          icdCode: "H25.13",
          description: "Age-related nuclear cataract, bilateral",
          laterality: "OU",
        },
        {
          icdCode: "H35.3131",
          description: "Nonexudative AMD, bilateral, early stage",
          laterality: "OU",
        },
      ],
      plan: "Refresh tears QID. Bifocal spectacle Rx dispensed. Follow up 6 months.",
    },
  },
  {
    id: "conversational-mess",
    name: "9. Conversational Mess (Noise Filtering)",
    description:
      "Tests noise filtering — social chat, non-linear findings, forgotten mid-exam checks.",
    transcript: `Hey Duy, how are the kids? Good? Glad to hear it. Let's take a look at these eyes. So you said the left one is itchy? Okay. Let me check the pressure first... hold still... okay, 18 in the right. And... 17 in the left.

Your vision today is actually still 20/20 with your old glasses. Let's see if we can sharpen that. Which is better, one... or two? Let's go with minus three-zero-zero sphere for both. Simple.

Look at my ear for a second. Yeah, that left cornea has a little scratch, probably from rubbing it. Right one is clear. Nerves look good, point-three cup. Everything else in the back is normal.

Oh, I forgot to check the lens — lenses are clear, no cataracts. So, for that itchiness, it's just a bit of allergic conjunctivitis. I'll give you a sample of Pataday. Use it once a day in the left eye. Otherwise, eyes are healthy. See you next time!`,
    expected: {
      chiefComplaint: "Left eye itchiness",
      vitals: { iopOd: 18, iopOs: 17, vaOdDistance: "20/20", vaOsDistance: "20/20" },
      refraction: {
        od: { sphere: "-3.00" },
        os: { sphere: "-3.00" },
      },
      anteriorFindings: {
        od: "Cornea clear; lens clear",
        os: "Corneal abrasion (scratch from rubbing); lens clear",
      },
      posteriorFindings: { od: "C/D 0.3, normal", os: "Normal" },
      diagnoses: [
        {
          icdCode: "H10.13",
          description: "Acute atopic conjunctivitis, left eye",
          laterality: "OS",
        },
      ],
      plan: "Pataday sample QD OS. Follow up PRN.",
      additionalNotes: "Findings dictated non-linearly; social conversation filtered.",
    },
  },
];
