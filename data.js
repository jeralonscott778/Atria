/* ------------------------------------------------------------------
   EDIT THIS FILE: hospital details, doctors and care packages.
   The website and the backend both read from here.
   Everything below is SAMPLE DATA for the demo — replace it with the real thing.
------------------------------------------------------------------- */
const DATA = {
  hospital: {
    name: "Atria",              // short name used in the logo
    fullName: "Atria Hospital", // used in messages
    phone: "",                  // e.g. "+233 24 123 4567"
    email: "",
    address: "",
    currency: "GHS"
  },

  specialties: ["General practice", "Paediatrics", "Obstetrics & gynaecology", "Cardiology", "Dermatology", "Orthopaedics", "Ophthalmology", "Dentistry"],

  // days: 0 = Sunday … 6 = Saturday.  start/end are 24-hour times.  video: can this doctor do video visits?
  doctors: [
    { id: "boateng", name: "Dr. Akosua Boateng", specialty: "General practice", title: "Consultant family physician", languages: ["English", "Twi"], years: 14, fee: 180, days: [1, 2, 3, 4, 5], start: "08:00", end: "13:00", video: true, bio: "Sees adults and families for everyday illness, long-term conditions and annual health reviews." },
    { id: "asante", name: "Dr. Kwame Asante", specialty: "Cardiology", title: "Consultant cardiologist", languages: ["English", "Twi", "Ga"], years: 18, fee: 350, days: [1, 3, 5], start: "09:00", end: "14:00", video: true, bio: "Blood pressure, chest pain, heart rhythm problems and heart failure, with ECG and echo on site." },
    { id: "owusu", name: "Dr. Efua Owusu", specialty: "Paediatrics", title: "Consultant paediatrician", languages: ["English", "Fante"], years: 11, fee: 200, days: [1, 2, 4, 5, 6], start: "08:30", end: "13:30", video: true, bio: "Newborn checks, childhood illness, growth, vaccination and asthma care from birth to sixteen." },
    { id: "sarpong", name: "Dr. Abena Sarpong", specialty: "Obstetrics & gynaecology", title: "Consultant obstetrician", languages: ["English", "Twi"], years: 16, fee: 300, days: [2, 3, 4], start: "09:00", end: "15:00", video: false, bio: "Antenatal care, delivery planning, fertility and women's health at every stage of life." },
    { id: "darko", name: "Dr. Yaw Darko", specialty: "Orthopaedics", title: "Orthopaedic surgeon", languages: ["English", "Twi"], years: 12, fee: 320, days: [2, 4], start: "10:00", end: "15:00", video: false, bio: "Joint pain, fractures, sports injuries and back problems, from first assessment to surgery." },
    { id: "frimpong", name: "Dr. Nana Ama Frimpong", specialty: "Dermatology", title: "Dermatologist", languages: ["English", "Twi", "French"], years: 9, fee: 260, days: [1, 3, 5], start: "12:00", end: "17:00", video: true, bio: "Skin, hair and nail conditions including eczema, acne and pigmentation, for adults and children." },
    { id: "salifu", name: "Dr. Ibrahim Salifu", specialty: "Ophthalmology", title: "Eye specialist", languages: ["English", "Hausa", "Dagbani"], years: 13, fee: 240, days: [1, 2, 3, 4], start: "08:00", end: "12:00", video: false, bio: "Eye tests, glaucoma, cataract assessment and diabetic eye screening." },
    { id: "antwi", name: "Dr. Kofi Antwi", specialty: "Dentistry", title: "Dental surgeon", languages: ["English", "Twi"], years: 10, fee: 220, days: [1, 2, 3, 4, 5, 6], start: "09:00", end: "16:00", video: false, bio: "Check-ups, fillings, extractions, cleaning and cosmetic dental work." }
  ],

  // price is charged once when the patient enrols; "per" is only a label.
  packages: [
    { id: "essential", name: "Essential health check", price: 450, per: "one visit", blurb: "A yearly check for adults who feel well and want to stay that way.", items: ["Doctor consultation", "Blood pressure and BMI", "Full blood count", "Blood sugar and cholesterol", "Written report"] },
    { id: "executive", name: "Executive health check", price: 1200, per: "one visit", blurb: "A deeper review in a single morning, with a consultant sign-off.", items: ["Consultant consultation", "Full blood panel", "ECG", "Chest X-ray", "Eye test", "Kidney and liver function", "Report and follow-up call"] },
    { id: "maternity", name: "Maternity care plan", price: 6500, per: "whole pregnancy", blurb: "One plan from first scan to six weeks after delivery.", items: ["Booking visit and first scan", "Antenatal visits", "Anomaly scan", "Routine antenatal labs", "Delivery planning visit", "Postnatal check for mother", "Newborn check"] },
    { id: "chronic", name: "Chronic care plan", price: 300, per: "per month", blurb: "Steady support for blood pressure, diabetes or asthma.", items: ["Monthly doctor review", "Monthly blood pressure and sugar check", "Medication review", "Refill reminder", "Nurse phone check-in"] }
  ]
};

if (typeof module !== "undefined") module.exports = DATA;
