"""
Generate ClarityOS Pitch Deck PDF — Friendly, outcome-focused, jargon-free.
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfgen import canvas
import os

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
TEAL = HexColor("#2DD4BF")
TEAL_DIM = HexColor("#E0FAF5")
TEAL_DARK = HexColor("#0D9488")
DARK = HexColor("#0F1729")
BODY = HexColor("#334155")
MUTED = HexColor("#64748B")
WHITE = HexColor("#FFFFFF")
LIGHT_BG = HexColor("#F8FAFC")
BORDER = HexColor("#E2E8F0")
ACCENT_BLUE = HexColor("#3B82F6")
GREEN = HexColor("#10B981")
AMBER = HexColor("#F59E0B")

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

def make_styles():
    s = {}
    s["title"] = ParagraphStyle(
        "Title", fontName="Helvetica-Bold", fontSize=28, leading=34,
        textColor=DARK, spaceAfter=6,
    )
    s["subtitle"] = ParagraphStyle(
        "Subtitle", fontName="Helvetica", fontSize=13, leading=18,
        textColor=MUTED, spaceAfter=24,
    )
    s["h1"] = ParagraphStyle(
        "H1", fontName="Helvetica-Bold", fontSize=20, leading=26,
        textColor=DARK, spaceBefore=0, spaceAfter=8,
    )
    s["h2"] = ParagraphStyle(
        "H2", fontName="Helvetica-Bold", fontSize=14, leading=19,
        textColor=TEAL_DARK, spaceBefore=14, spaceAfter=6,
    )
    s["body"] = ParagraphStyle(
        "Body", fontName="Helvetica", fontSize=10.5, leading=16,
        textColor=BODY, spaceAfter=8,
    )
    s["body_bold"] = ParagraphStyle(
        "BodyBold", fontName="Helvetica-Bold", fontSize=10.5, leading=16,
        textColor=DARK, spaceAfter=8,
    )
    s["bullet"] = ParagraphStyle(
        "Bullet", fontName="Helvetica", fontSize=10.5, leading=16,
        textColor=BODY, spaceAfter=4, leftIndent=18, bulletIndent=6,
    )
    s["callout"] = ParagraphStyle(
        "Callout", fontName="Helvetica-Bold", fontSize=11, leading=16,
        textColor=TEAL_DARK, spaceAfter=4,
    )
    s["callout_body"] = ParagraphStyle(
        "CalloutBody", fontName="Helvetica", fontSize=10.5, leading=16,
        textColor=BODY, spaceAfter=10, leftIndent=12,
    )
    s["footer"] = ParagraphStyle(
        "Footer", fontName="Helvetica", fontSize=8, leading=10,
        textColor=MUTED, alignment=TA_CENTER,
    )
    s["tagline"] = ParagraphStyle(
        "Tagline", fontName="Helvetica-BoldOblique", fontSize=12, leading=17,
        textColor=TEAL_DARK, spaceAfter=20,
    )
    s["section_label"] = ParagraphStyle(
        "SectionLabel", fontName="Helvetica-Bold", fontSize=9, leading=12,
        textColor=TEAL, spaceAfter=4,
    )
    s["stat_value"] = ParagraphStyle(
        "StatValue", fontName="Helvetica-Bold", fontSize=22, leading=26,
        textColor=TEAL_DARK, alignment=TA_CENTER,
    )
    s["stat_label"] = ParagraphStyle(
        "StatLabel", fontName="Helvetica", fontSize=9, leading=12,
        textColor=MUTED, alignment=TA_CENTER,
    )
    return s

# ---------------------------------------------------------------------------
# Page template with header/footer
# ---------------------------------------------------------------------------

def page_template(canvas_obj, doc):
    canvas_obj.saveState()
    w, h = letter
    # Top accent bar
    canvas_obj.setFillColor(TEAL)
    canvas_obj.rect(0, h - 4, w, 4, fill=1, stroke=0)
    # Footer
    canvas_obj.setFont("Helvetica", 8)
    canvas_obj.setFillColor(MUTED)
    canvas_obj.drawString(doc.leftMargin, 28, "ClarityOS EHR  |  clarityos.com")
    canvas_obj.drawRightString(w - doc.rightMargin, 28, f"Page {doc.page}")
    canvas_obj.restoreState()

def cover_template(canvas_obj, doc):
    canvas_obj.saveState()
    w, h = letter
    canvas_obj.setFillColor(TEAL)
    canvas_obj.rect(0, h - 8, w, 8, fill=1, stroke=0)
    canvas_obj.setFillColor(HexColor("#F0FDFA"))
    canvas_obj.rect(0, h - 280, w, 272, fill=1, stroke=0)
    canvas_obj.restoreState()

# ---------------------------------------------------------------------------
# Helper builders
# ---------------------------------------------------------------------------

def hr():
    return HRFlowable(width="100%", thickness=1, color=BORDER, spaceBefore=12, spaceAfter=12)

def section_header(styles, label, title):
    return [
        Paragraph(label, styles["section_label"]),
        Paragraph(title, styles["h1"]),
        Spacer(1, 4),
    ]

def problem_solution(styles, problem, solution_items, result=None):
    elements = []
    elements.append(Paragraph(f"<b>The problem:</b> {problem}", styles["body"]))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph("<b>How ClarityOS helps:</b>", styles["body_bold"]))
    for item in solution_items:
        elements.append(Paragraph(f"\u2022  {item}", styles["bullet"]))
    if result:
        elements.append(Spacer(1, 6))
        elements.append(Paragraph(f"\u2714  <b>Bottom line:</b> {result}", styles["callout"]))
    return elements

def stat_box(styles, value, label):
    return Table(
        [[Paragraph(value, styles["stat_value"])],
         [Paragraph(label, styles["stat_label"])]],
        colWidths=[1.5 * inch],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), TEAL_DIM),
            ("BOX", (0, 0), (-1, -1), 1, BORDER),
            ("ROUNDEDCORNERS", [6, 6, 6, 6]),
            ("TOPPADDING", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]),
    )

# ---------------------------------------------------------------------------
# Build document
# ---------------------------------------------------------------------------

def build():
    out_path = os.path.join(os.path.dirname(__file__), "ClarityOS-Pitch-Deck.pdf")
    doc = SimpleDocTemplate(
        out_path,
        pagesize=letter,
        topMargin=0.75 * inch,
        bottomMargin=0.65 * inch,
        leftMargin=0.85 * inch,
        rightMargin=0.85 * inch,
    )
    styles = make_styles()
    story = []

    # -----------------------------------------------------------------------
    # COVER PAGE
    # -----------------------------------------------------------------------
    story.append(Spacer(1, 80))
    story.append(Paragraph("ClarityOS", styles["title"]))
    story.append(Paragraph(
        "The modern EHR built exclusively for optometry.",
        styles["subtitle"],
    ))
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "Most EHR systems were built for general medicine and awkwardly adapted for eye care. "
        "ClarityOS is different \u2014 it was designed from scratch for the optometric exam room. "
        "Every workflow, every screen, every shortcut reflects how you actually see patients. "
        "Less clicking, fewer errors, and charts that are always ready for an audit.",
        styles["body"],
    ))
    story.append(Spacer(1, 20))

    # Stats row
    stats = Table(
        [[stat_box(styles, "<60s", "Normal exam\ndocumentation"),
          stat_box(styles, "7-Step", "Guided sign-off\nchecklist"),
          stat_box(styles, "5 Roles", "Staff see only\nwhat they need"),
          stat_box(styles, "100%", "Every chart is\naudit-ready")]],
        colWidths=[doc.width / 4] * 4,
        style=TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]),
    )
    story.append(stats)
    story.append(Spacer(1, 30))
    story.append(Paragraph(
        "Designed for California practices. Built for high-compliance environments everywhere.",
        styles["tagline"],
    ))
    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # WHY A DIFFERENT EHR
    # -----------------------------------------------------------------------
    story.extend(section_header(styles, "THE OPPORTUNITY", "Why Your Practice Deserves Better"))
    story.append(Paragraph(
        "If you're a California optometrist, you already know \u2014 documentation requirements are intense. "
        "Board of Optometry oversight, HIPAA, and the growing complexity of medical optometry "
        "(glaucoma co-management, diabetic eye care, TPA procedures) mean your EHR needs to do more than just store notes. "
        "It needs to keep you protected.",
        styles["body"],
    ))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "ClarityOS was built from day one for optometry \u2014 not retrofitted from a general medicine template. "
        "That means fewer workarounds, faster charting, and confidence that your documentation meets "
        "the standards your board and your payers expect.",
        styles["body"],
    ))
    story.append(hr())

    # -----------------------------------------------------------------------
    # 1. COMPLIANCE
    # -----------------------------------------------------------------------
    story.extend(section_header(styles, "FEATURE 01", "Every Chart Is Audit-Ready the Moment You Sign It"))
    story.extend(problem_solution(
        styles,
        "Unsigned encounters, missing timestamps, and incomplete records create real liability "
        "during audits. Manual attestation steps are easy to skip or forget.",
        [
            "<b>Verified signer identity</b> \u2014 When you sign a chart, ClarityOS confirms exactly who you are "
            "using your staff profile, license number, and NPI. No generic signatures.",
            "<b>Tamper-proof timestamps</b> \u2014 The date and time of every signature are set by the server, "
            "not your computer's clock. They can't be altered after the fact.",
            "<b>Permanent lock</b> \u2014 Once signed, everything in the chart \u2014 vitals, findings, diagnoses \u2014 is locked. "
            "There's no \"unsign\" button. If you need to add something later, you create an addendum.",
            "<b>Nothing is ever deleted</b> \u2014 Even if a record is marked as removed, the original content is preserved "
            "with a timestamp. This satisfies HIPAA's 6-year retention requirement automatically.",
        ],
        "Your auditor sees a clean, unbroken chain of signed records. No gaps, no questions.",
    ))
    story.append(hr())

    # -----------------------------------------------------------------------
    # 2. WNL
    # -----------------------------------------------------------------------
    story.extend(section_header(styles, "FEATURE 02", "Document a Healthy Patient in Under 60 Seconds"))
    story.extend(problem_solution(
        styles,
        "For a patient with normal findings, you're still clicking through 5\u20138 dropdowns and text fields "
        "just to say \"everything looks good.\" It's tedious and it adds up fast.",
        [
            "<b>One-click \"All Normal\"</b> \u2014 A single button marks every structure in a section as within normal limits. "
            "Anterior segment? One click. Posterior segment? One click. Done.",
            "<b>Easy abnormal documentation</b> \u2014 When something isn't normal, just pick the structure, choose the finding, "
            "and select which eye. Laterality is built right in.",
            "<b>Copy right eye to left</b> \u2014 If both eyes have the same finding, one button mirrors it. No double entry.",
            "<b>Structured and searchable</b> \u2014 Your findings are stored in a way that makes them easy to search, "
            "report on, and export later \u2014 not buried in free-text notes.",
        ],
        "Save 3\u20135 minutes per normal exam. Over a 20-patient day, that's an hour back in your schedule.",
    ))
    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 3. MPPL
    # -----------------------------------------------------------------------
    story.extend(section_header(styles, "FEATURE 03", "Your Patient's History Follows Them Automatically"))
    story.extend(problem_solution(
        styles,
        "Chronic conditions get re-entered every visit. Glaucoma suspect? Type it again. "
        "Diabetic retinopathy? Hunt for the ICD-10 code again. Past history gets buried in old notes.",
        [
            "<b>Persistent problem list</b> \u2014 Every active condition lives on a master list that travels with "
            "the patient from visit to visit. No more digging through old encounters.",
            "<b>One-click carry-forward</b> \u2014 See \"Glaucoma suspect, OD\" on the problem list? Click \"Bring Forward\" "
            "and it drops into today's chart \u2014 complete with the ICD-10 code, laterality, and severity.",
            "<b>No accidental duplicates</b> \u2014 If a condition is already in today's chart, "
            "the system shows \"Added\" instead of letting you add it twice.",
            "<b>Automatic updates</b> \u2014 Resolve a condition during today's visit? When you sign the chart, "
            "the master list updates on its own. The next provider sees the resolution without any extra steps.",
        ],
        "Every encounter starts with full context. No more \"What was the code for their glaucoma again?\"",
    ))
    story.append(hr())

    # -----------------------------------------------------------------------
    # 4. BILLING
    # -----------------------------------------------------------------------
    story.extend(section_header(styles, "FEATURE 04", "Clean Claims, Fewer Denials"))
    story.extend(problem_solution(
        styles,
        "Missing laterality is the #1 reason optometry claims get denied. A code like \"H40.11\" "
        "gets bounced because the payer needs the full code with eye and severity. "
        "Resubmitting delays payment by 30\u201360 days.",
        [
            "<b>Code validation at entry</b> \u2014 ClarityOS checks every ICD-10 code the moment you enter it. "
            "If something's wrong, you'll know before it reaches your billing queue.",
            "<b>Laterality is built in</b> \u2014 OD, OS, or OU is a required field on every diagnosis. "
            "It's not something you have to remember to type in.",
            "<b>Severity captured at point of care</b> \u2014 Mild, moderate, or severe is recorded during the exam, "
            "not reconstructed later by your billing team.",
            "<b>Perfect carry-forward</b> \u2014 When a problem is brought forward from the master list, "
            "all the billing details come with it exactly. No transcription errors.",
        ],
        "Claims go out right the first time. Your billers spend less time on resubmissions.",
    ))
    story.append(hr())

    # -----------------------------------------------------------------------
    # 5. IOP ALERTS
    # -----------------------------------------------------------------------
    story.extend(section_header(styles, "FEATURE 05", "Critical Alerts You Can't Miss"))
    story.extend(problem_solution(
        styles,
        "Elevated IOP can get buried in a vitals table. A tech records 24 mmHg, "
        "the doctor starts the exam, and nobody flags it until chart review.",
        [
            "<b>Always-visible alerts</b> \u2014 A persistent bar at the top of every encounter page shows "
            "key warnings \u2014 you see them before you even sit down at the slit lamp.",
            "<b>Automatic IOP flags</b> \u2014 Any reading over 21 mmHg triggers a warning badge, "
            "shown per eye, updating instantly when the tech saves vitals.",
            "<b>Everything in one place</b> \u2014 Drug allergies, critical medical history, and IOP alerts "
            "all appear in the same row. One glance, full picture.",
        ],
        "You're informed from the very first moment of the encounter. Nothing slips through.",
    ))
    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 6. DATA PROTECTION
    # -----------------------------------------------------------------------
    story.extend(section_header(styles, "FEATURE 06", "Your Work Is Always Saved"))
    story.extend(problem_solution(
        styles,
        "You dictate three minutes of clinical notes, then accidentally close the browser tab. "
        "In most systems, all that work is gone. You're left retyping from memory.",
        [
            "<b>Automatic backup</b> \u2014 Every keystroke is continuously saved in the background. "
            "If your browser crashes or you accidentally hit refresh, your work is waiting for you when you come back.",
            "<b>\"Are you sure?\" guard</b> \u2014 If you try to close the tab with unsaved work, "
            "the browser asks you to confirm \u2014 catching the most common accident: Command+W or a stray click.",
            "<b>Smart deactivation</b> \u2014 Once you've signed and sealed the chart, the guard turns off. "
            "A finalized chart has nothing to lose, so you navigate freely.",
            "<b>No slowdowns</b> \u2014 The auto-save happens silently in the background. "
            "You'll never notice it running \u2014 there's zero delay while you type.",
        ],
        "Dictate with confidence. Your work is protected no matter what happens.",
    ))
    story.append(hr())

    # -----------------------------------------------------------------------
    # 7. REFRACTION
    # -----------------------------------------------------------------------
    story.extend(section_header(styles, "FEATURE 07", "Enter Prescriptions Without Touching the Mouse"))
    story.extend(problem_solution(
        styles,
        "Entering a refraction with a mouse means clicking through 14+ fields. "
        "With a phoropter in one hand and a patient waiting, that's too slow.",
        [
            "<b>Full keyboard entry</b> \u2014 Tab through sphere, cylinder, axis, and add for each eye. "
            "Use arrow keys to adjust in standard 0.25 D steps.",
            "<b>Built-in guardrails</b> \u2014 Sphere and cylinder snap to quarter-diopter increments. "
            "Axis stays within 1\u2013180 degrees. You can't enter an invalid value.",
            "<b>Multiple Rx types side by side</b> \u2014 Habitual, auto, manifest, cycloplegic, and final "
            "prescriptions all live on the same encounter. Compare them at a glance.",
            "<b>Complete before dispensing</b> \u2014 The system won't let you mark a final Rx without PD values. "
            "No incomplete prescriptions leave the office.",
        ],
    ))
    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 8. SECURITY
    # -----------------------------------------------------------------------
    story.extend(section_header(styles, "FEATURE 08", "Your Patient Data Stays Yours \u2014 Period"))
    story.extend(problem_solution(
        styles,
        "With shared EHR systems, there's always a nagging question: "
        "\"Could another clinic accidentally see my patients?\" That should never be a concern.",
        [
            "<b>Complete data isolation</b> \u2014 Every clinic gets its own separate database space. "
            "Your data is physically walled off from every other practice. It's not just a filter \u2014 it's a wall.",
            "<b>Verified identity on every action</b> \u2014 Every time someone accesses your system, "
            "ClarityOS confirms who they are and which clinic they belong to before allowing anything.",
            "<b>Five staff roles with precise permissions</b> \u2014 Doctor, Technician, Receptionist, Admin, and Owner. "
            "Each role sees only what they need for their job \u2014 nothing more.",
        ],
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Who Sees What", styles["h2"]))
    story.append(Paragraph(
        "Your staff only sees what's relevant to their job. This isn't optional \u2014 it's how the system works:",
        styles["body"],
    ))
    roles_data = [
        ["Role", "What They Can Do", "What They Can't Do"],
        ["Doctor", "Full clinical access \u2014 chart, diagnose, sign", "N/A \u2014 full access"],
        ["Technician", "Enter vitals, pre-tests, auto-refraction", "Can't view doctor's notes or sign charts"],
        ["Receptionist", "See demographics, insurance, schedule", "Clinical data is completely hidden"],
        ["Admin", "Manage staff and practice settings", "No access to patient charts"],
        ["Owner", "Full admin + clinical access if practicing", "Can be configured as admin-only if non-clinical"],
    ]
    role_table = Table(roles_data, colWidths=[1.0 * inch, 2.5 * inch, 2.8 * inch])
    role_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEADING", (0, 0), (-1, -1), 13),
        ("BACKGROUND", (0, 1), (-1, -1), LIGHT_BG),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
    ]))
    story.append(role_table)
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "This isn't just a visual restriction. If someone's role doesn't include access, "
        "the data simply isn't sent to their screen. There are no hidden buttons or workarounds.",
        styles["body"],
    ))
    story.append(hr())

    # Admin Command Center
    story.append(Paragraph("Your Practice, Under Your Control", styles["h2"]))
    story.append(Paragraph(
        "Managing your team should be simple. With ClarityOS, it is:",
        styles["body"],
    ))
    for item in [
        "<b>Add staff in seconds</b> \u2014 Invite a team member, pick their role, and they're ready to go. "
        "No IT department needed.",
        "<b>Owner + Doctor in one profile</b> \u2014 If you own the practice and see patients, you don't need "
        "two accounts. One login gives you full admin control and full clinical access, with your NPI linked "
        "to every chart you sign.",
        "<b>Change roles instantly</b> \u2014 Promote a tech? Their access updates everywhere, immediately. "
        "Someone leaving the practice? Revoke their access in one click.",
        "<b>Full activity log</b> \u2014 Every access event is recorded: who viewed what, when, and from where. "
        "If a question ever comes up during a HIPAA review, you have the answer ready.",
    ]:
        story.append(Paragraph(f"\u2022  {item}", styles["bullet"]))
    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 9. AI SCRIBE
    # -----------------------------------------------------------------------
    story.extend(section_header(styles, "FEATURE 09", "Just Talk \u2014 The Chart Fills Itself"))
    story.extend(problem_solution(
        styles,
        "A single encounter can mean 40+ data entries across vitals, findings, diagnoses, "
        "prescriptions, and the SOAP note. Every minute you spend typing is a minute away from your patient.",
        [
            "<b>Speak naturally during the exam</b> \u2014 Say something like \"IOP 14 and 16, "
            "acuity 20/25 both eyes, anterior segments clear, cup-to-disc 0.3 OU, impression glaucoma suspect\" "
            "\u2014 and ClarityOS takes care of the rest.",
            "<b>SOAP note writes itself</b> \u2014 A complete, properly structured note appears on screen "
            "in real time as you speak. No waiting, no post-visit dictation.",
            "<b>Fields fill automatically</b> \u2014 While the note is being written, ClarityOS also populates "
            "your vitals, findings, and diagnosis fields. One dictation fills the whole chart.",
            "<b>Every change is tracked</b> \u2014 You can see exactly what the AI filled in and what was there before. "
            "Full transparency, always.",
        ],
    ))
    story.append(hr())

    # Clinical Diff Viewer
    story.append(Paragraph("You Review Everything Before It's Final", styles["h2"]))
    story.append(Paragraph(
        "AI should help you, not make decisions for you. Before any AI-suggested changes go into your chart, "
        "you see a clear side-by-side comparison:",
        styles["body"],
    ))
    for item in [
        "<b>See exactly what changed</b> \u2014 Old values are shown with a strikethrough, "
        "new suggestions are highlighted. Nothing is hidden.",
        "<b>Accept or reject one at a time</b> \u2014 Keep the IOP values but reject an incorrect axis? "
        "No problem. You control each field individually.",
        "<b>Diagnoses reviewed separately</b> \u2014 Each suggested ICD-10 code appears as its own item. "
        "Confirm or remove each one on its own.",
        "<b>Nothing changes until you say so</b> \u2014 Your original data stays exactly as it was "
        "until you hit \"Accept.\" The AI never writes over your work without permission.",
    ]:
        story.append(Paragraph(f"\u2022  {item}", styles["bullet"]))
    story.append(hr())

    # Finalize Modal
    story.append(Paragraph("A Guided Checklist So Nothing Gets Missed", styles["h2"]))
    story.append(Paragraph(
        "Rushing through sign-off with missing diagnoses or unreviewed alerts is how mistakes happen. "
        "ClarityOS walks you through a simple 7-step review before the chart is sealed:",
        styles["body"],
    ))
    steps = [
        ("1. Chief Complaint", "Quick review of why the patient came in"),
        ("2. Vitals Check", "Highlights any IOP readings above 21 mmHg"),
        ("3. Diagnoses", "Can't proceed without at least one diagnosis on file"),
        ("4. Final Rx", "Side-by-side view of right and left eye prescriptions"),
        ("5. Assessment & Plan", "Brief note required \u2014 no blank sign-offs allowed"),
        ("6. Attestation", "Confirm the documentation is accurate and complete"),
        ("7. Sign & Seal", "Locks the chart permanently once all steps are satisfied"),
    ]
    step_data = [["Step", "What Happens"]]
    for step, desc in steps:
        step_data.append([step, desc])
    step_table = Table(step_data, colWidths=[1.6 * inch, 4.7 * inch])
    step_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEADING", (0, 0), (-1, -1), 13),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
    ]))
    story.append(step_table)
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "After you sign, every field locks permanently. A confirmation banner shows your name and timestamp. "
        "The chart is sealed, compliant, and ready for any review.",
        styles["body"],
    ))
    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # ROADMAP
    # -----------------------------------------------------------------------
    story.extend(section_header(styles, "ROADMAP", "What's Here \u2014 and What's Coming"))
    roadmap_data = [
        ["Phase", "Feature", "Status"],
        ["Phase 1", "Core EHR \u2014 Vitals, refractions, exam findings, diagnoses, problem list, sign-off", "Complete"],
        ["Phase 2", "AI Scribe \u2014 Speak during the exam, chart fills automatically", "Complete"],
        ["Phase 2", "AI Review \u2014 See and approve every change the AI suggests", "Complete"],
        ["Phase 2", "Sign & Seal \u2014 Guided 7-step chart finalization", "Complete"],
        ["Phase 2", "Scheduling \u2014 Appointment booking, check-in, and daily calendar", "Complete"],
        ["Phase 2", "Optical Queue \u2014 Track dispensing with Rx change alerts", "Complete"],
        ["Phase 2", "Patient detail page with Rx history and visit timeline", "Planned"],
        ["Phase 3", "Device integration \u2014 Import OCT and visual field data directly", "Planned"],
        ["Phase 3", "Data export \u2014 Share patient records with other systems", "Planned"],
        ["Phase 4", "Patient portal \u2014 Online booking, Rx lookup, secure messaging", "Planned"],
        ["Phase 4", "Billing integration \u2014 Submit claims and process payments", "Planned"],
    ]
    roadmap_table = Table(roadmap_data, colWidths=[0.8 * inch, 4.2 * inch, 1.2 * inch])
    roadmap_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEADING", (0, 0), (-1, -1), 13),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
    ]))
    story.append(roadmap_table)
    story.append(Spacer(1, 20))

    # -----------------------------------------------------------------------
    # CLOSING
    # -----------------------------------------------------------------------
    story.append(hr())
    story.append(Spacer(1, 8))
    story.append(Paragraph("The Bottom Line", styles["h1"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "ClarityOS doesn't ask you to change how you practice. It fits the way you already work \u2014 "
        "the way you examine patients, the way you document findings, the way you run your office \u2014 "
        "and makes all of it faster, safer, and easier to manage.",
        styles["body"],
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Less time charting. Fewer claim denials. Zero audit anxiety.",
        styles["body"],
    ))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "Built for the exam room. Designed for your peace of mind. Ready when you are.",
        styles["tagline"],
    ))

    # Build
    doc.build(story, onFirstPage=cover_template, onLaterPages=page_template)
    print(f"\nPDF generated: {out_path}")


if __name__ == "__main__":
    build()
