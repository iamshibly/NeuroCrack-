// Real educational content for HSC (Science) Zoology chapters.
// Content is aligned with the Bangladesh NCTB curriculum for Class 11-12.
// Each chapter is structured as titled sections for better chunk retrieval.

export type ChapterDoc = {
  chapterId: string;
  chapterTitle: string;
  subject: string;
  class: string;
  sections: { heading: string; body: string }[];
};

export const ZOOLOGY_CHAPTERS: Record<string, ChapterDoc> = {
  "Chapter 01: Diversity and Classification of Animals": {
    chapterId: "zoology-hsc-ch01",
    chapterTitle: "Diversity and Classification of Animals",
    subject: "Zoology",
    class: "HSC (Science)",
    sections: [
      {
        heading: "Introduction to Animal Diversity",
        body: `The animal kingdom (Kingdom Animalia) is the most diverse group of multicellular organisms on Earth, with over 1.5 million known species. Animals are eukaryotic, multicellular, heterotrophic organisms that typically reproduce sexually. They lack cell walls and obtain nutrition by ingesting organic material. Animal diversity spans from microscopic organisms like rotifers to massive blue whales. This diversity is studied through taxonomy, the science of naming and classifying organisms.`,
      },
      {
        heading: "Basis of Classification",
        body: `Animals are classified based on several fundamental criteria:
1. Cell organization: Unicellular (Protozoa) vs. multicellular (Metazoa)
2. Body symmetry: Asymmetry (sponges), radial symmetry (cnidarians, echinoderms), bilateral symmetry (most animals including humans)
3. Germ layers: Diploblastic (two germ layers — ectoderm and endoderm, e.g., jellyfish) vs. Triploblastic (three layers — ectoderm, mesoderm, endoderm, e.g., vertebrates)
4. Coelom type: Acoelomate (no body cavity, e.g., flatworms), Pseudocoelomate (false coelom, e.g., roundworms), Eucoelomate (true coelom lined by mesoderm, e.g., earthworms, humans)
5. Segmentation: Presence of metameric segmentation (annelids, arthropods)
6. Notochord: Presence of notochord (phylum Chordata)`,
      },
      {
        heading: "Major Animal Phyla",
        body: `The major phyla of Kingdom Animalia are:
- Phylum Porifera: Sponges. Simplest multicellular animals, no true tissues, sessile, filter feeders. Example: Sycon, Euspongia.
- Phylum Cnidaria: Jellyfish, coral, sea anemones. Radially symmetric, diploblastic, have cnidocytes (stinging cells). Example: Hydra, Aurelia.
- Phylum Platyhelminthes: Flatworms. Bilaterally symmetric, acoelomate, triploblastic. Example: Fasciola (liver fluke), Taenia (tapeworm).
- Phylum Nematoda (Aschelminthes): Roundworms. Pseudocoelomate, cylindrical body. Example: Ascaris.
- Phylum Annelida: Segmented worms. True coelom, metameric segmentation. Example: Lumbricus (earthworm), Hirudo (leech).
- Phylum Arthropoda: Largest phylum. Jointed appendages, exoskeleton, open circulatory system. Example: insects, spiders, crabs.
- Phylum Mollusca: Soft-bodied, mantle and shell. Example: Pila (apple snail), Octopus.
- Phylum Echinodermata: Marine, spiny skin, radial symmetry in adult, water vascular system. Example: Starfish, Sea urchin.
- Phylum Chordata: Notochord, dorsal hollow nerve cord, pharyngeal gill slits. Includes fish, amphibians, reptiles, birds, mammals.`,
      },
      {
        heading: "Taxonomic Hierarchy",
        body: `The taxonomic hierarchy (from broadest to most specific) is:
Kingdom → Phylum → Class → Order → Family → Genus → Species
Memory aid: "King Philip Came Over For Good Soup"
Example for humans: Kingdom Animalia → Phylum Chordata → Class Mammalia → Order Primates → Family Hominidae → Genus Homo → Species Homo sapiens
Binomial nomenclature: Every species has a two-part Latin name (genus + species), written in italics. Proposed by Carl Linnaeus.`,
      },
      {
        heading: "Vertebrates vs Invertebrates",
        body: `Invertebrates (about 97% of all animal species) lack a vertebral column. They include all phyla except Chordata's vertebrate subphylum.
Vertebrates (Subphylum Vertebrata) have:
- A vertebral column (backbone) replacing the notochord in adults
- Closed circulatory system
- Well-developed brain protected by a skull
- Classes: Pisces (fish), Amphibia, Reptilia, Aves (birds), Mammalia
Progressive features from fish to mammals include development of four limbs, amniotic egg, homeothermy (warm-bloodedness), and placental reproduction.`,
      },
    ],
  },

  "Chapter 02: Introduction to Animals": {
    chapterId: "zoology-hsc-ch02",
    chapterTitle: "Introduction to Animals",
    subject: "Zoology",
    class: "HSC (Science)",
    sections: [
      {
        heading: "Characteristics of Animals",
        body: `Animals share the following fundamental characteristics:
1. Eukaryotic: Cells have a membrane-bound nucleus and organelles
2. Multicellular: Composed of many cells with specialized functions
3. Heterotrophic: Cannot produce their own food; must consume organic matter
4. No cell wall: Animal cells lack the rigid cell wall present in plants and fungi
5. Active movement: Most animals can move actively during at least part of their life cycle
6. Sexual reproduction: Typically reproduce sexually, producing gametes (sperm and egg)
7. Diploid: Most body cells contain two sets of chromosomes (diploid)
8. Nervous system: Most have a nervous system for coordination and response to stimuli`,
      },
      {
        heading: "Animal Cell Structure",
        body: `The animal cell contains the following organelles:
- Cell membrane (plasma membrane): Selectively permeable phospholipid bilayer; controls what enters and exits the cell
- Nucleus: Contains DNA (genetic material), controls cell activities; surrounded by nuclear envelope with pores
- Mitochondria: "Powerhouse of the cell"; produces ATP through cellular respiration; has its own DNA
- Endoplasmic Reticulum (ER): Rough ER (has ribosomes, makes proteins) and Smooth ER (makes lipids, detoxifies)
- Ribosomes: Site of protein synthesis; found on rough ER and free in cytoplasm
- Golgi apparatus (Golgi body): Modifies, packages, and ships proteins and lipids; makes lysosomes
- Lysosomes: Contain digestive enzymes; break down waste materials and cellular debris
- Centrosome/Centrioles: Important for cell division (mitosis and meiosis)
- Vacuoles: Store water, nutrients, waste; smaller than plant cell vacuoles
- Cytoplasm: Jelly-like fluid filling the cell; site of many metabolic reactions
Note: Animal cells do NOT have cell walls, chloroplasts, or large central vacuoles (unlike plant cells)`,
      },
      {
        heading: "Organization Levels in Animals",
        body: `Animal body organization follows a hierarchical structure from simple to complex:
1. Cell level: Basic unit of life; e.g., sponges at cellular level of organization
2. Tissue level: Groups of similar cells performing a specific function; e.g., Cnidaria (jellyfish)
3. Organ level: Groups of tissues working together; e.g., Platyhelminthes (flatworms have primitive organs)
4. Organ system level: Groups of organs forming systems; e.g., all vertebrates
The four basic animal tissues:
- Epithelial tissue: Covers body surfaces and lines cavities; protection, secretion, absorption
- Connective tissue: Supports and binds other tissues; includes bone, cartilage, blood, adipose tissue
- Muscle tissue: Responsible for movement; types: skeletal (voluntary), smooth (involuntary, visceral), cardiac (heart)
- Nervous tissue: Conducts electrical impulses; neurons and glial cells`,
      },
      {
        heading: "Life Processes in Animals",
        body: `All animals perform these fundamental life processes:
1. Nutrition: Ingestion (taking in food), digestion, absorption, assimilation, egestion
2. Respiration: Cellular respiration produces ATP from glucose; aerobic respiration: C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ATP
3. Excretion: Removal of metabolic waste (CO₂, urea, uric acid, water)
4. Transport/Circulation: Movement of materials within the body through circulatory system
5. Reproduction: Asexual (budding, fragmentation) or sexual (gametes)
6. Growth: Increase in cell size and number
7. Response to stimuli: Detection of environmental changes and appropriate reaction`,
      },
      {
        heading: "Differences Between Animal and Plant Cells",
        body: `Key differences between animal and plant cells:
Feature | Animal Cell | Plant Cell
Cell wall | Absent | Present (cellulose)
Chloroplasts | Absent | Present
Vacuole | Small, multiple | Large central vacuole
Centrioles | Present | Absent (except lower plants)
Shape | Irregular | Fixed, regular
Lysosomes | Prominent | Rare
Nutrition | Heterotrophic (ingestion) | Autotrophic (photosynthesis)`,
      },
    ],
  },

  "Chapter 03: Digestion and Absorption": {
    chapterId: "zoology-hsc-ch03",
    chapterTitle: "Digestion and Absorption",
    subject: "Zoology",
    class: "HSC (Science)",
    sections: [
      {
        heading: "Overview of Digestion",
        body: `Digestion is the process of breaking down complex food molecules into simpler molecules that can be absorbed and used by the body. There are two types:
1. Mechanical digestion: Physical breakdown of food (chewing, churning in stomach)
2. Chemical digestion: Enzymatic breakdown of large molecules into smaller ones
- Carbohydrates → Monosaccharides (glucose, fructose, galactose)
- Proteins → Amino acids
- Fats (Lipids) → Fatty acids and glycerol
- Nucleic acids → Nucleotides
Digestion can be intracellular (inside cells, e.g., Amoeba, Porifera) or extracellular (outside cells in a digestive cavity, e.g., most animals including humans).`,
      },
      {
        heading: "Human Digestive System",
        body: `The human digestive system consists of the alimentary canal and accessory organs:
Alimentary canal: Mouth → Pharynx → Esophagus → Stomach → Small intestine (Duodenum, Jejunum, Ileum) → Large intestine (Cecum, Colon, Rectum) → Anus
Accessory organs: Salivary glands, Liver, Gallbladder, Pancreas

Process in each region:
- Mouth: Mechanical digestion (chewing), salivary amylase begins starch digestion
- Esophagus: Peristalsis moves food to stomach (no digestion)
- Stomach: Gastric juice (HCl + pepsinogen → pepsin) digests proteins; mucus protects lining; food becomes chyme
- Small intestine: Main site of digestion and absorption; receives bile (from liver), pancreatic juice
- Large intestine: Water and salt absorption; formation of feces; bacterial activity (produces vitamin K, B12)`,
      },
      {
        heading: "Digestive Enzymes",
        body: `Key digestive enzymes and their actions:
Salivary glands:
- Salivary amylase (ptyalin): Starch → Maltose (optimal pH 6.8)

Stomach:
- Pepsin (from pepsinogen): Proteins → Peptides (optimal pH 2)
- Gastric lipase: Fats → Fatty acids + glycerol
- Rennin: Milk protein (casein) coagulation (mainly in infants)

Pancreas (pancreatic juice, pH 8):
- Pancreatic amylase: Starch → Maltose
- Trypsin (from trypsinogen): Proteins → Peptides
- Chymotrypsin: Proteins → Peptides
- Pancreatic lipase: Fats → Fatty acids + glycerol
- DNase, RNase: DNA/RNA → Nucleotides

Small intestine (intestinal juice/succus entericus):
- Maltase: Maltose → 2 Glucose
- Lactase: Lactose → Glucose + Galactose
- Sucrase: Sucrose → Glucose + Fructose
- Peptidases (erepsin): Peptides → Amino acids`,
      },
      {
        heading: "Role of Liver and Bile",
        body: `The liver is the largest gland in the body. Its digestive function:
- Produces bile (about 600-1000 mL/day)
- Bile is stored and concentrated in the gallbladder
- Bile is released into the duodenum via the bile duct
Bile contains:
- Bile salts (sodium glycocholate, sodium taurocholate): Emulsify fats into tiny droplets (emulsification), increasing surface area for lipase action
- Bile pigments (bilirubin, biliverdin): Breakdown products of hemoglobin; give feces brown color
- Cholesterol, water, electrolytes
Note: Bile is NOT an enzyme — it does not chemically digest fats, it only emulsifies them.`,
      },
      {
        heading: "Absorption",
        body: `Absorption is the process by which digested nutrients pass from the small intestine into the blood or lymph.
Adaptations of small intestine for absorption:
- Long length (~6-7 meters in humans)
- Villi: Finger-like projections increasing surface area
- Microvilli (brush border): On each epithelial cell, further increasing surface area
- Rich blood supply (capillaries and lacteals in each villus)
Absorption mechanisms:
- Glucose and amino acids: Active transport into blood capillaries
- Fatty acids and glycerol: Form micelles → enter epithelial cells → reform into triglycerides → packaged as chylomicrons → enter lacteals (lymph vessels)
- Water: Osmosis
- Vitamins: Fat-soluble (A, D, E, K) absorbed with fats; Water-soluble (B, C) by diffusion/active transport`,
      },
      {
        heading: "Digestion in Other Animals",
        body: `Different animals have evolved different digestive strategies:
- Amoeba: Intracellular digestion; food enclosed in food vacuole, digestive enzymes secreted into vacuole
- Hydra: Extracellular digestion in gastrovascular cavity + intracellular digestion
- Earthworm: Complete digestive system (mouth → pharynx → esophagus → crop → gizzard → intestine → anus); calciferous glands neutralize soil acids; typhlosole increases surface area
- Cockroach: Complete digestive system with salivary glands, crop, gizzard (proventriculus), malpighian tubules for excretion
- Ruminants (cow, goat): Four stomach chambers (rumen, reticulum, omasum, abomasum); cellulose digested by microbes in rumen; cud chewing (rumination)`,
      },
    ],
  },

  "Chapter 04: Blood Circulation": {
    chapterId: "zoology-hsc-ch04",
    chapterTitle: "Blood Circulation",
    subject: "Zoology",
    class: "HSC (Science)",
    sections: [
      {
        heading: "Overview of Circulatory Systems",
        body: `Circulatory systems transport nutrients, gases, hormones, and waste products throughout an animal's body. There are two main types:
1. Open circulatory system: Blood (hemolymph) pumped from heart into open sinuses (body cavities); blood directly bathes the organs; lower pressure; found in arthropods (insects, crabs) and most molluscs (except cephalopods)
2. Closed circulatory system: Blood confined within vessels (arteries, veins, capillaries) at all times; higher pressure; more efficient oxygen delivery; found in annelids, cephalopod molluscs, all vertebrates
Types of hearts in vertebrates:
- Fish: 2-chambered heart (1 atrium + 1 ventricle); single circulation
- Amphibians: 3-chambered heart (2 atria + 1 ventricle); double but incomplete circulation (mixed blood)
- Reptiles: 3-chambered heart (except crocodiles which have 4 chambers); incomplete separation
- Birds and Mammals: 4-chambered heart (2 atria + 2 ventricles); complete double circulation (oxygenated and deoxygenated blood fully separated)`,
      },
      {
        heading: "Human Heart Structure",
        body: `The human heart is a muscular organ located in the thoracic cavity, slightly to the left, enclosed in the pericardium (double-layered membrane).
Structure:
- Four chambers: Right atrium (RA), Right ventricle (RV), Left atrium (LA), Left ventricle (LV)
- Left ventricle wall is thickest (pumps blood to entire body against high resistance)
- Valves prevent backflow of blood:
  * Tricuspid valve: Between RA and RV (3 cusps)
  * Bicuspid (Mitral) valve: Between LA and LV (2 cusps)
  * Pulmonary semilunar valve: Between RV and pulmonary artery
  * Aortic semilunar valve: Between LV and aorta
- Septum: Muscular wall separating left and right sides (no mixing of oxygenated and deoxygenated blood)
- Chordae tendineae: String-like tendons attached to atrioventricular valves; prevent valve inversion
- Papillary muscles: Attached to chordae tendineae; contract to close AV valves`,
      },
      {
        heading: "Cardiac Cycle and Heart Rate",
        body: `The cardiac cycle is one complete heartbeat, consisting of:
1. Systole (contraction phase):
   - Atrial systole: Both atria contract → blood pushed into ventricles (~0.1 seconds)
   - Ventricular systole: Both ventricles contract → blood pumped to lungs (from RV) and body (from LV) (~0.3 seconds)
2. Diastole (relaxation phase): All chambers relax and fill with blood (~0.4 seconds)
Total cardiac cycle duration: ~0.8 seconds
Normal heart rate: 72 beats per minute (adult at rest)
Cardiac output = Heart rate × Stroke volume = 72 × 70 mL ≈ 5 L/min
Heart sounds:
- "Lub" (S1): Closure of AV valves (bicuspid and tricuspid) at start of ventricular systole
- "Dub" (S2): Closure of semilunar valves (aortic and pulmonary) at end of ventricular systole
Electrical conduction: SA node (pacemaker) → AV node → Bundle of His → Purkinje fibers → ventricular contraction`,
      },
      {
        heading: "Blood Vessels",
        body: `Three types of blood vessels:
1. Arteries: Carry blood AWAY from the heart; thick muscular walls to withstand high pressure; no valves (except at aortic and pulmonary origins); arteries → arterioles → capillaries
   - Aorta: Largest artery; carries oxygenated blood from LV to body
   - Pulmonary artery: Carries deoxygenated blood from RV to lungs (exception: artery with deoxygenated blood)
2. Veins: Carry blood TOWARD the heart; thinner walls, larger lumen; have valves to prevent backflow; veins receive blood from venules
   - Vena cava (Superior and Inferior): Largest veins; return deoxygenated blood to RA
   - Pulmonary vein: Carries oxygenated blood from lungs to LA (exception: vein with oxygenated blood)
3. Capillaries: Microscopic; one cell thick (allows gas/nutrient exchange); connect arterioles to venules`,
      },
      {
        heading: "Blood Composition and Functions",
        body: `Blood is a fluid connective tissue consisting of:
1. Plasma (55%): Yellow fluid; 90% water + proteins (albumin, globulin, fibrinogen) + nutrients + hormones + waste
2. Formed elements (45%):
   - Red blood cells (Erythrocytes, RBC): No nucleus in mature form; contain hemoglobin; transport O₂ and CO₂; 4.5-5.5 million/mm³; lifespan ~120 days; produced in bone marrow; destroyed in liver/spleen
   - White blood cells (Leukocytes, WBC): Nucleated; part of immune system; 4,000-11,000/mm³; types: neutrophils, lymphocytes, monocytes, eosinophils, basophils
   - Platelets (Thrombocytes): Cell fragments; involved in blood clotting; 1.5-4 lakh/mm³
Blood functions: Transport O₂ and CO₂, distribute nutrients and hormones, remove waste, regulate temperature, immunity (WBCs, antibodies), clotting`,
      },
      {
        heading: "Double Circulation in Humans",
        body: `Humans have a double circulatory system — blood passes through the heart twice per complete circuit:
1. Pulmonary circulation (Right side of heart → Lungs → Left side of heart):
   - Deoxygenated blood: Right atrium → Tricuspid valve → Right ventricle → Pulmonary semilunar valve → Pulmonary arteries → Lungs (CO₂ released, O₂ absorbed) → Pulmonary veins → Left atrium
2. Systemic circulation (Left side of heart → Body → Right side of heart):
   - Oxygenated blood: Left atrium → Bicuspid valve → Left ventricle → Aortic semilunar valve → Aorta → Body tissues (O₂ delivered, CO₂ collected) → Superior/Inferior vena cava → Right atrium
Portal circulation: Blood from digestive organs → hepatic portal vein → liver (nutrients processed) → hepatic vein → inferior vena cava. This is a special branch of systemic circulation.`,
      },
      {
        heading: "Blood Groups and Transfusion",
        body: `ABO Blood Group System (discovered by Karl Landsteiner):
Blood Group | Antigen on RBC | Antibody in Plasma | Can Donate To | Can Receive From
A | A antigen | Anti-B | A, AB | A, O
B | B antigen | Anti-A | B, AB | B, O
AB | A and B antigens | None | AB only | All groups (Universal recipient)
O | None | Anti-A and Anti-B | All groups (Universal donor) | O only
Rh Factor: Rh-positive (Rh+) has Rh antigen; Rh-negative (Rh-) lacks it. Important in pregnancy (Rh incompatibility between Rh- mother and Rh+ fetus can cause hemolytic disease in newborn).`,
      },
    ],
  },
};

/** Returns a chapter document if available. Case-insensitive key match. */
export function getChapterDoc(chapterName: string): ChapterDoc | null {
  const key = Object.keys(ZOOLOGY_CHAPTERS).find(
    (k) => k.toLowerCase() === chapterName.toLowerCase(),
  );
  return key ? (ZOOLOGY_CHAPTERS[key] ?? null) : null;
}

/** Returns all text content from a chapter as a single string. */
export function chapterToPlainText(doc: ChapterDoc): string {
  return doc.sections
    .map((s) => `## ${s.heading}\n\n${s.body}`)
    .join("\n\n---\n\n");
}
