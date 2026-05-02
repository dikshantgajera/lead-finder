const CATEGORIES = [
  "Abortion Clinic","Accountant","Accounting","Accounting Firm","Accounting School",
  "Accounting Software Company","Adult Education School","Advertising","Advertising Service",
  "Aerospace Company","Air Compressor Supplier","Air Conditioning Contractor","Air Duct Cleaning Service",
  "Airline","Airport","Airport Shuttle Service","Airsoft Supply Store","Alcohol Retail Monopoly",
  "Allergist","Alternative Medicine Practitioner","American Restaurant","Amusement Center",
  "Amusement Park","Animal Control Service","Animal Hospital","Animal Shelter","Animation Studio",
  "Antique Furniture Store","Antique Store","Apartment Building","Apartment Complex",
  "Appliance Repair Service","Appliance Store","Aquarium","Archery Club","Archery Range",
  "Archery Store","Architectural And Engineering Model Maker","Architectural Designer",
  "Architectural Salvage Store","Architecture Firm","Architecture School","Architects Association",
  "Art Cafe","Art Center","Art Gallery","Art School","Art Studio","Art Supply Store",
  "Association Or Organization","Attorney","Audio Visual Equipment Rental Service",
  "Audio Visual Equipment Repair Service","Audio Visual Equipment Supplier",
  "Auto Body Shop","Auto Broker","Auto Dent Removal Service","Auto Electrical Service",
  "Auto Glass Shop","Auto Insurance Agency","Auto Machine Shop","Auto Parts Store",
  "Auto Painting","Auto Repair Shop","Auto Restoration Service","Auto Sunroof Shop",
  "Auto Wrecker","Automation Company",
  "Bakery","Bakery Equipment","Bank","Bank Or Atm","Baptist Church","Bankruptcy Service",
  "Bar","Barber School","Barber Shop","Barber Supply Store","Beauty Salon",
  "Bed And Breakfast","Bicycle Repair Shop","Bicycle Store","Bikram Yoga Studio",
  "Billboard","Bike Rental Service","Blood Bank","Board Of Education","Boat Builder",
  "Boat Dealer","Boat Repair Shop","Body Piercing Shop","Book Store","Bottled Water Supplier",
  "Boutique","Boxing Gym","Brewery","Bridal Shop","Buddhist Temple",
  "Building Material Store","Business Banking Service","Business Broker",
  "Business Management Consultant","Business Park","Business School","Business To Business Service",
  "Butcher Shop",
  "Cabinetmaker","Car Dealership","Car Rental Agency","Car Wash","Cafeteria",
  "Catering","Catering Food And Drink Supplier","Cell Phone Store","Cemetery",
  "Chamber Of Commerce","Chartered Accountant","Chicken Restaurant","Child Care Agency",
  "Childrens Cafe","Chinese Bakery","Chiropractor","Church",
  "City Department Of Transportation","City Government Office","City Tax Office",
  "Civil Engineering Company","Civil Engineer","Civil Law Attorney",
  "Cleaning Service","Clergyman","Clinic","Clothing Store","Club",
  "Cocktail Bar","Coffee Shop","College","Commercial Agent","Commercial Cleaning Service",
  "Commercial Real Estate Agency","Community Center","Condominium Complex",
  "Construction","Construction And Maintenance Office","Construction Company",
  "Construction Machine Rental Service","Construction Material Wholesaler",
  "Consultant","Convenience Store","Cosplay Cafe","Counselor","County Government Office",
  "Credit Reporting Agency","Criminal Justice Attorney","Customs Broker",
  "Dance School","Dance Studio","Day Care Center","Day Spa","Dental Clinic",
  "Dental Hygienist","Dental Implants Provider","Dental Insurance Agency",
  "Dental School","Dental Supply Store","Dental","Dentist","Department Of Motor Vehicles",
  "Department Of Transportation","Design Agency","Digital Printer","Digital Printing Service",
  "Direct Mail Advertising","Dog Cafe","Driver And Vehicle Licensing Agency",
  "Drug Store","Dj Service","Doctor",
  "Education","Educational Testing Service","Elder Law Attorney",
  "Electric Motor Repair Shop","Electric Utility Company","Electrical Engineer",
  "Electrical Equipment Supplier","Electrical Installation Service","Electrical Substation",
  "Electronics Store","Emergency Dental Service","Employment Agency",
  "Engineer","Environmental Engineer","Equipment Rental Agency",
  "Estate Agent","Estate Planning Attorney","Event Technology Service","Excavating Contractor",
  "Exhibition Planner","Export Company",
  "Fabrication Engineer","Facial Spa","Faculty Of Pharmacy","Family Practice Physician",
  "Farm","Farm Equipment Supplier","Farmers' Market","Fashion Designer",
  "Federal Credit Union","Fencing Salon","Finance Company",
  "Financial Advisor","Financial Company","Financial Consultant",
  "Financial Institution","Financial Planner","Financial Planning","Financial Services",
  "Fireplace Store","Fishing Charter","Fitness Center","Fitness Equipment Wholesaler",
  "Floor Refinishing Service","Flooring Contractor","Flooring Store",
  "Flower Designer","Food Broker","Food Manufacturer","Food Producer",
  "Fraternal Organization","Freight Forwarding Service","Fund Management Company",
  "Funeral Home","Furniture Maker","Furniture Store",
  "Gas Station","General Contractor","General Hospital","General Practice Attorney",
  "Geotechnical Engineer","Gift Shop","Glass Blowing Supply","Gluten-free Restaurant",
  "Government Office","Graduate School","Grocery Store","Gym","Gymnastics Center",
  "Gymnastics Club","Gymnasium School",
  "Hair Extension Technician","Hair Salon","Handicapped Transportation Service",
  "Hardware Store","Health Insurance Agency","Health Resort","Health Spa",
  "Heating Contractor","Historical Landmark","Home Builder","Home Goods Store",
  "Home Health Care Service","Homeopathic Pharmacy","Hookah Bar","Hospital Department",
  "Hospital Equipment And Supplies","Hotel","Hotel Management School","Hotel Supply Store",
  "Housing Complex","Human Resource Consulting","Hvac Contractor",
  "Indoor Lodging","Industrial Equipment Supplier","Institute Of Technology",
  "Insurance","Insurance Agency","Insurance Attorney","Insurance Company",
  "Intellectual Property Registry","Interior Architect Office",
  "Interior Construction Contractor","Internet Cafe","Internet Marketing Service",
  "Internist","Investment Bank","Investment Company","Investment Service",
  "Italian Restaurant",
  "Janitorial Service","Japanese Restaurant","Jehovah's Witness Kingdom Hall",
  "Jeweler","Jewelry Designer","Jewelry Store","Juice Shop",
  "Lake","Land Surveying Office","Landscape Architect","Landscape Lighting Designer",
  "Landscaper","Landscaping Supply Store","Law Firm","Lawn Care Service",
  "Lawn Mower Repair Service","Lawn Mower Store","Lawn Sprinkler System Contractor",
  "Legal Affairs Bureau","Legal Aid Office","Legally Defined Lodging",
  "Life Insurance Agency","Liquor Store","Livestock","Livestock Auction House",
  "Livestock Breeder","Livestock Dealer","Livestock Producer","Lodge",
  "Lodging","Lost Property Office","Love Hotel",
  "Mailing Service","Manufacturer","Marine Surveyor","Market","Market Researcher",
  "Marketing Agency","Marriage Or Relationship Counselor","Massage Therapist",
  "Media And Information Sciences Faculty","Media Company","Media Consultant",
  "Media House","Mediation Service","Medical Center","Medical Clinic","Medical Group",
  "Medical Office","Medical School","Medical Technology Manufacturer",
  "Mental Health Clinic","Mexican Restaurant","Mobile Money Agent",
  "Money Transfer Service","Mortgage Broker","Mortgage Lender",
  "Mosque","Mountain Peak","Muay Thai Boxing Gym","Multimedia And Electronic Book Publisher",
  "Nanotechnology Engineer","Newspaper Advertising Department","Non-profit Organization",
  "Notary Public",
  "Obstetrician-gynecologist","Office Space Rental Agency","Optician","Optometrist",
  "Oral Surgeon","Orthopedic Clinic","Orthopedic Surgeon",
  "Pain Control Clinic","Paintball Center","Painting","Painting Lessons","Painting Studio",
  "Paint Manufacturer","Paint Store","Paint Stripping Service","Paintings Store",
  "Paralegal Services Provider","Parapharmacy","Park","Parking Lot","Parsi Temple",
  "Part Time Daycare","Party Equipment Rental Service","Party Planner","Passport Agent",
  "Passport Photo Processor","Paving Contractor","Pediatrician","Pedestrian Zone",
  "Performing Arts Theater","Perfume Store","Permanent Make-up Clinic",
  "Personal Injury Attorney","Personal Trainer","Pest Control Service","Pet Groomer",
  "Pet Supply Store","Pharmacy","Photographer","Photography Service",
  "Physical Fitness Program","Physical Therapist","Physical Therapy Clinic",
  "Physician Assistant","Piano Instructor","Picture Frame Shop",
  "Pizza Delivery","Pizza Restaurant","Place Of Worship","Plant Nursery",
  "Plastic Fabrication Company","Plastic Injection Molding Service","Playground",
  "Plumber","Plumbing Supply Store","Podiatrist","Police Academy","Police Department",
  "Pool Academy","Pool Cleaning Service","Portable Toilet Supplier","Post Office",
  "Postal Code","Powersports Vehicle Dealer","Pre Gymnasium School","Presbyterian Church",
  "Preschool","Press Advisory","Pressure Washing Service","Private Educational Institution",
  "Private Investigator","Probation Office","Produce Market","Produce Wholesaler",
  "Professional Services","Promotional Products Supplier","Property Administrator",
  "Property Investment","Property Maintenance","Property Management Company",
  "Psychiatric Hospital","Psychiatrist","Psychologist","Psychotherapist",
  "Public Bathroom","Public Educational Institution","Public Health Department",
  "Public Library","Public Relations Firm","Public Swimming Pool","Public Webcam",
  "Public Wheelchair-accessible Bathroom","Public Works Department","Publisher","Pulmonologist",
  "Quantity Surveyor",
  "Radio Broadcaster","Radiologist","Ready Mix Concrete Supplier","Real Estate Agency",
  "Real Estate Agent","Real Estate Agents","Real Estate Appraiser","Real Estate Attorney",
  "Real Estate Consultant","Real Estate Developer","Real Estate Rental Agency",
  "Real Estate School","Real Estate Surveyor","Recording Studio","Recreation Center",
  "Recreational Vehicle Rental Agency","Recruiter","Recycling Center",
  "Refrigerated Transport Service","Refrigerator Repair Service","Registered General Nurse",
  "Rehabilitation Center","Religious Book Store","Religious Destination",
  "Religious Goods Store","Religious Institution","Religious Organisation",
  "Religious Organization","Religious School","Renter's Insurance Agency",
  "Rescue Squad","Reservoir","Resort","Resort Hotel","Restaurant","Restaurant Or Cafe",
  "Retail Space Rental Agency","Retirement Community","River",
  "Road Construction Company","Rock Climbing Gym","Roller Skating Rink",
  "Roofing Contractor","Roofing Supply Store",
  "Safety Equipment Supplier","Salvage Yard","Sandwich Shop","School",
  "School District Office","Science Academy","Screen Printer","Seafood Market",
  "Seafood Restaurant","Seafood Wholesaler","Security Guard Service",
  "Security System Supplier","Self-catering Accommodation","Self-storage Facility",
  "Seventh-day Adventist Church","Shipping And Mailing Service","Shipyard",
  "Shopping Mall","Showroom","Skateboard Park","Skateboard Shop","Ski Resort",
  "Skin Care Clinic","Slaughterhouse","Sleep Clinic","Slope",
  "Small Appliance Repair Service","Small Engine Repair Service","Smog Inspection Station",
  "Snack Bar","Snow Removal Service","Snowboard Rental Service","Snowboard Shop",
  "Snowmobile Dealer","Snowmobile Rental Service","Soccer Club",
  "Social Security Financial Department","Social Services Organization",
  "Social Worker","Software Company","Software Training Institute",
  "Solar Energy Equipment Supplier","Solar Photovoltaic Power Plant","Spa",
  "Special Education School","Speech Pathologist","Sporting Goods Store",
  "Sports Bar","Sports Club","Sports Complex","Sports Medicine Physician",
  "Sportswear Store","Spring","Squash Club","Squash Court","Stained Glass Studio",
  "State Department Finance","State Department Of Transportation","State Government Office",
  "Steel Construction Company","Stock Broker","Stock Exchange Building",
  "Storage Facility","Store","Structural Engineer","Sunglasses Store",
  "Superfund Site","Supermarket","Surgeon","Surveyor","Swim Club",
  "Swimming Lake","Swimming Pool","Swimming Pool Contractor",
  "Swimming Pool Repair Service","Swimming Pool Supply Store","Synagogue",
  "Tanning Salon","Taoist Temple","Tax Assessor","Tax Attorney",
  "Tax Collector's Office","Tax Consultant","Tax Department",
  "Tax Preparation","Tax Preparation Service","Taxi Service","Taxidermist",
  "Technical Education Academy","Technical School","Technical Service","Technology Park",
  "Teeth Whitening Service","Telecommunications Service Provider","Television Station",
  "Tesla Showroom","Tiffin Center","Tire Shop","Tobacco Shop",
  "Tourist Attraction","Tourist Information Center","Towing Service","Town Square",
  "Townhouse Complex","Toyota Dealer","Trading Card Store","Translator",
  "Transmission Shop","Transport Interchange","Transportation Escort Service",
  "Transportation Infrastructure","Transportation Service","Travel Agency",
  "Travellers Lodge","Tree Service","Truck Accessories Store","Truck Dealer",
  "Truck Parts Supplier","Truck Rental Agency","Truck Repair Shop","Truck Stop",
  "Trucking","Trucking Company","Trucking School","Trust Bank","Tutoring Service",
  "Typewriter Repair Service","Typewriter Supplier",
  "United Methodist Church","University","University Hospital",
  "Used Car Dealer","Used Truck Dealer",
  "Vacation Home Rental Agency","Vaporizer Store","Variety Store","Vascular Surgeon",
  "Vegetarian Cafe And Deli","Vehicle Exporter","Vehicle Inspection",
  "Vehicle Shipping Agent","Vehicle Wrapping Service","Venture Capital Company",
  "Veterans Hospital","Veterans Organization","Veterinarian","Veterinary Pharmacy",
  "Video Production Service","Vineyard","Vitamin & Supplements Store",
  "Vocal Instructor","Vocational School","Volleyball Club","Volleyball Court",
  "Volunteer Organization",
  "Warehouse","Washer & Dryer Repair Service","Waste Management Service",
  "Water Damage Restoration Service","Water Utility Company","Waterproofing Company",
  "Waxing Hair Removal Service","Web Hosting Company","Webcam Location",
  "Website Designer","Wedding Bakery","Wedding Photographer","Wedding Planner",
  "Wedding Venue","Weight Loss Service","Welder","Well Drilling Contractor",
  "Wellness Center","Wellness Hotel","Wesleyan Church","Wholesale Bakery",
  "Wholesale Florist","Wholesale Grocer","Wholesale Jeweler","Wholesale Plant Nursery",
  "Wholesaler","Wi-fi Spot","Window Cleaning Service","Window Installation Service",
  "Window Tinting Service","Window Treatment Store","Wine Bar","Wine Store",
  "Winery","Women's Clothing Store","Women's Health Clinic",
  "Wood Floor Installation Service","Woodworker","Wrestling School",
  "Yacht Broker","Yacht Club","Yarn Store","Yeshiva","Yoga Instructor",
  "Yoga Retreat Center","Yoga Studio","Youth Center","Youth Club",
  "Youth Organization","Youth Social Services Organization","Yucatan Restaurant",
  "Zoo"
];

/* ═══════════════════════════════════════════════════
   CATEGORY DROPDOWN
   ═══════════════════════════════════════════════════ */
let categoryHighlightIdx = -1;
let categoryDropdownOpen = false;

function buildCategoryList(filter) {
  const list = document.getElementById('categoryList');
  const q = (filter || '').trim().toLowerCase();
  const matches = q
    ? CATEGORIES.filter(c => c.toLowerCase().includes(q))
    : CATEGORIES;

  if (matches.length === 0) {
    list.innerHTML = '<div class="category-no-results">No matching categories</div>';
    categoryHighlightIdx = -1;
    return;
  }

  list.innerHTML = matches.map((cat, i) => {
    const current = document.getElementById('category').value;
    const isActive = cat === current;
    let label;
    if (q) {
      const idx = cat.toLowerCase().indexOf(q);
      if (idx !== -1) {
        label =
          esc(cat.slice(0, idx)) +
          '<span class="match-highlight">' + esc(cat.slice(idx, idx + q.length)) + '</span>' +
          esc(cat.slice(idx + q.length));
      } else {
        label = esc(cat);
      }
    } else {
      label = esc(cat);
    }
    return `<div class="category-item${isActive ? ' active' : ''}"
      data-value="${esc(cat)}"
      data-idx="${i}"
      onmousedown="selectCategory(event, '${cat.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">
      ${label}
    </div>`;
  }).join('');

  categoryHighlightIdx = -1;
}

function openCategoryDropdown() {
  const wrap = document.getElementById('categoryWrap');
  if (!wrap.classList.contains('open')) {
    wrap.classList.add('open');
    categoryDropdownOpen = true;
    buildCategoryList(document.getElementById('category').value);
  }
}

function closeCategoryDropdown() {
  document.getElementById('categoryWrap').classList.remove('open');
  categoryDropdownOpen = false;
  categoryHighlightIdx = -1;
}

function toggleCategoryDropdown() {
  if (categoryDropdownOpen) {
    closeCategoryDropdown();
  } else {
    document.getElementById('category').focus();
    openCategoryDropdown();
  }
}

function filterCategories() {
  openCategoryDropdown();
  buildCategoryList(document.getElementById('category').value);
}

function selectCategory(event, value) {
  event.preventDefault();
  document.getElementById('category').value = value;
  closeCategoryDropdown();
}

function categoryKeyNav(event) {
  if (!categoryDropdownOpen) {
    if (event.key === 'ArrowDown' || event.key === 'Enter') openCategoryDropdown();
    return;
  }
  const items = document.querySelectorAll('#categoryList .category-item');
  if (!items.length) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    categoryHighlightIdx = Math.min(categoryHighlightIdx + 1, items.length - 1);
    updateHighlight(items);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    categoryHighlightIdx = Math.max(categoryHighlightIdx - 1, 0);
    updateHighlight(items);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (categoryHighlightIdx >= 0 && items[categoryHighlightIdx]) {
      document.getElementById('category').value = items[categoryHighlightIdx].dataset.value;
      closeCategoryDropdown();
    } else {
      closeCategoryDropdown();
    }
  } else if (event.key === 'Escape') {
    closeCategoryDropdown();
  }
}

function updateHighlight(items) {
  items.forEach((el, i) => {
    el.classList.toggle('highlighted', i === categoryHighlightIdx);
    if (i === categoryHighlightIdx) el.scrollIntoView({ block: 'nearest' });
  });
}

// Close when clicking outside
document.addEventListener('mousedown', (e) => {
  const categoryWrap = document.getElementById('categoryWrap');
  if (categoryWrap && !categoryWrap.contains(e.target)) {
    closeCategoryDropdown();
  }
  const countryWrap = document.getElementById('countryWrap');
  if (countryWrap && !countryWrap.contains(e.target)) {
    closeCountryDropdown();
  }
});

// Init on load
document.addEventListener('DOMContentLoaded', () => {
  buildCategoryList();
  buildCountryList();
  loadLocalLeads();
  applyCrmFilters();
  initPuter();
});

async function initPuter() {
  if (typeof puter === 'undefined') {
    console.warn('Puter.js not loaded');
    return;
  }
  
  try {
    // Puter v2 initialization
    if (!puter.auth.isSignedIn()) {
      console.log('User not signed into Puter. Prompting...');
      // We can prompt on demand, but let's at least check
    }

    // Ensure directories exist
    await puter.fs.mkdir('/leads').catch(() => {});
    await puter.fs.mkdir('/crm').catch(() => {});
    console.log('Puter FS initialized');
  } catch (err) {
    console.error('Puter initialization failed:', err);
  }
}

/* ═══════════════════════════════════════════════════
   VIEW SWITCHING
   ═══════════════════════════════════════════════════ */
function switchView(view) {
  // Update Tabs
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + view).classList.add('active');

  // Update Views
  document.querySelectorAll('.app-view').forEach(v => v.style.display = 'none');
  document.getElementById('view-' + view).style.display = 'block';

  // Load data for specific views
  if (view === 'leads') loadLeadsLibrary();
  if (view === 'crm') loadCrmManager();
  
  // Update counter display
  document.getElementById('leadCounter').style.display = (view === 'search') ? 'inline-flex' : 'none';
}

/* ═══════════════════════════════════════════════════
   COUNTRY DATA
   ═══════════════════════════════════════════════════ */
const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua & Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia & Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo - Brazzaville", "Congo - Kinshasa", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia", "Côte d’Ivoire", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar (Burma)", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Samoa", "San Marino", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "St. Kitts & Nevis", "St. Lucia", "St. Vincent & Grenadines", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "São Tomé & Príncipe", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad & Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];
