
import { Pitch, Referee, Goalkeeper, Team, ServiceJob, Transaction, Review, BusinessInsight, JobListing, IncomingBid, WalletTransaction, MatchListing, MatchHistoryItem, DirectOffer, OpponentListing, Player } from './types';

// Helper to generate slots
const generateSlots = () => [
  { time: '19:00', status: Math.random() > 0.6 ? 'booked' : 'available' },
  { time: '20:00', status: Math.random() > 0.5 ? 'booked' : 'available' },
  { time: '21:00', status: Math.random() > 0.4 ? 'booked' : 'available' },
  { time: '22:00', status: Math.random() > 0.3 ? 'booked' : 'available' },
  { time: '23:00', status: 'available' },
] as any;

export const GOALKEEPERS: Goalkeeper[] = [
  {
    id: 'gk1',
    name: 'Kaleci Deniz A.',
    height: '1.90m',
    age: 37,
    rating: 4.9,
    fee: 850,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    recentAwards: 'Efsane',
    style: 'Lider',
    bio: 'Deneyimli ve güvenilir performans',
    preferredZones: ['Seyrantepe', 'Sarıyer'],
    isElite: true,
    coordinates: { lat: 41.1034, lng: 28.9856 },
    stats: {
      savePercentage: '95', cleanSheets: 15, penaltySaveRate: '50',
      reflexes: 92, diving: 94, positioning: 98, distribution: 88, oneOnOne: 96, aerialReach: 90
    },
    skills: { reflexes: 92, diving: 94, handling: 96, positioning: 98, kicking: 85, speed: 70 },
    equipment: { gloves: 'Puma Future Grip', boots: 'Puma Future Ultimate', jersey: 'Özel Forma' },
    reviews: []
  },
  {
    id: 'gk2',
    name: 'Kaleci Onur S.',
    height: '1.88m',
    age: 29,
    rating: 4.8,
    fee: 750,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    recentAwards: 'Panter',
    style: 'Refleks',
    bio: 'Dünya Kupası yıldızı, çizgideki çevikliğiyle tanınır.',
    preferredZones: ['Kadıköy', 'Üsküdar'],
    isElite: true,
    coordinates: { lat: 40.9901, lng: 29.0234 },
    stats: {
      savePercentage: '92', cleanSheets: 12, penaltySaveRate: '45',
      reflexes: 98, diving: 95, positioning: 88, distribution: 82, oneOnOne: 94, aerialReach: 85
    },
    skills: { reflexes: 98, diving: 95, handling: 85, positioning: 88, kicking: 80, speed: 75 },
    equipment: { gloves: 'Adidas Predator Pro', boots: 'Adidas Copa Pure', jersey: 'Özel Forma' },
    reviews: []
  },
  {
    id: 'gk3',
    name: 'Kaleci Baran Y.',
    height: '1.91m',
    age: 27,
    rating: 4.7,
    fee: 650,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    recentAwards: 'Kaptan',
    style: 'Refleks',
    bio: 'Deneyimli ve güvenilir performans',
    preferredZones: ['Trabzon', 'Beyoğlu'],
    isElite: false,
    coordinates: { lat: 41.058, lng: 29.002 },
    stats: {
      savePercentage: '90', cleanSheets: 10, penaltySaveRate: '35',
      reflexes: 96, diving: 92, positioning: 85, distribution: 78, oneOnOne: 92, aerialReach: 88
    },
    skills: { reflexes: 96, diving: 92, handling: 88, positioning: 85, kicking: 78, speed: 72 },
    equipment: { gloves: 'Nike Vapor Grip', boots: 'Nike Mercurial', jersey: 'Özel Forma' },
    reviews: []
  },
  {
    id: 'gk4',
    name: 'Kaleci Tolga Ş.',
    height: '1.96m',
    age: 35,
    rating: 4.7,
    fee: 600,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    recentAwards: 'Tecrübe',
    style: 'Ayak Hakimiyeti',
    bio: 'Milli takımın tecrübeli eldiveni, oyun kurma yeteneğiyle fark yaratıyor.',
    preferredZones: ['Sarıyer', 'Şişli'],
    isElite: true,
    coordinates: { lat: 41.045, lng: 29.005 },
    stats: {
      savePercentage: '89', cleanSheets: 9, penaltySaveRate: '32',
      reflexes: 88, diving: 85, positioning: 92, distribution: 95, oneOnOne: 85, aerialReach: 90
    },
    skills: { reflexes: 88, diving: 85, handling: 90, positioning: 92, kicking: 95, speed: 65 },
    equipment: { gloves: 'Puma Ultra', boots: 'Puma King', jersey: 'Özel Forma' },
    reviews: []
  },
  {
    id: 'gk5',
    name: 'Kaleci Eren K.',
    height: '1.98m',
    age: 25,
    rating: 4.5,
    fee: 550,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    recentAwards: 'Genç Yetenek',
    style: 'Dengeli',
    bio: 'Fiziğiyle kaleyi küçülten, yüksek toplarda etkili bir isim.',
    preferredZones: ['Kadıköy', 'Ataşehir'],
    isElite: false,
    coordinates: { lat: 40.985, lng: 29.035 },
    stats: {
      savePercentage: '88', cleanSheets: 8, penaltySaveRate: '30',
      reflexes: 90, diving: 88, positioning: 82, distribution: 85, oneOnOne: 88, aerialReach: 95
    },
    skills: { reflexes: 90, diving: 88, handling: 82, positioning: 82, kicking: 85, speed: 68 },
    equipment: { gloves: 'Adidas Predator', boots: 'Adidas X Speedportal', jersey: 'Man Utd 23/24 GK' },
    reviews: []
  },
  {
    id: 'gk6',
    name: 'Kaleci Can E.',
    height: '1.93m',
    age: 25,
    rating: 4.4,
    fee: 500,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    recentAwards: 'Dinamik',
    style: 'Panter',
    bio: 'Enerjisi ve hırsıyla takımına güven veren genç eldiven.',
    preferredZones: ['Göztepe', 'Kadıköy'],
    isElite: false,
    coordinates: { lat: 40.975, lng: 29.055 },
    stats: {
      savePercentage: '85', cleanSheets: 6, penaltySaveRate: '25',
      reflexes: 92, diving: 90, positioning: 78, distribution: 75, oneOnOne: 88, aerialReach: 82
    },
    skills: { reflexes: 92, diving: 90, handling: 78, positioning: 78, kicking: 75, speed: 80 },
    equipment: { gloves: 'Reusch Attrakt', boots: 'Nike Phantom', jersey: 'Özel Forma' },
    reviews: []
  },
  {
    id: 'gk7',
    name: 'Kaleci Ali D.',
    height: '1.95m',
    age: 23,
    rating: 4.3,
    fee: 450,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    recentAwards: 'Şampiyon',
    style: 'Dengeli',
    bio: 'Deneyimli ve güvenilir performans',
    preferredZones: ['Beşiktaş', 'Ortaköy'],
    isElite: false,
    coordinates: { lat: 41.055, lng: 28.998 },
    stats: {
      savePercentage: '84', cleanSheets: 5, penaltySaveRate: '20',
      reflexes: 85, diving: 82, positioning: 80, distribution: 82, oneOnOne: 80, aerialReach: 88
    },
    skills: { reflexes: 85, diving: 82, handling: 80, positioning: 80, kicking: 82, speed: 70 },
    equipment: { gloves: 'Nike Vapor', boots: 'Nike Tiempo', jersey: 'Özel Forma' },
    reviews: []
  },
  {
    id: 'gk8',
    name: 'Günay Güvenç',
    height: '1.87m',
    age: 32,
    rating: 4.4,
    fee: 500,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    recentAwards: 'İstikrar',
    style: 'Lider',
    bio: 'Kalesinde güven veren, tecrübeli bir isim.',
    preferredZones: ['Florya', 'Bakırköy'],
    isElite: false,
    coordinates: { lat: 41.060, lng: 29.012 },
    stats: {
      savePercentage: '87', cleanSheets: 7, penaltySaveRate: '28',
      reflexes: 86, diving: 84, positioning: 88, distribution: 80, oneOnOne: 85, aerialReach: 80
    },
    skills: { reflexes: 86, diving: 84, handling: 88, positioning: 88, kicking: 80, speed: 72 },
    equipment: { gloves: 'Adidas Predator', boots: 'Adidas Copa', jersey: 'Özel Forma' },
    reviews: []
  },
  {
    id: 'gk9',
    name: 'Bilal Bayazit',
    height: '1.85m',
    age: 24,
    rating: 4.3,
    fee: 400,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    recentAwards: 'Yükselen Yıldız',
    style: 'Refleks',
    bio: 'Kayserispor\'da gösterdiği performansla dikkat çeken genç yetenek.',
    preferredZones: ['Kayseri', 'Ataşehir'],
    isElite: false,
    coordinates: { lat: 41.058, lng: 29.035 },
    stats: {
      savePercentage: '86', cleanSheets: 6, penaltySaveRate: '22',
      reflexes: 90, diving: 88, positioning: 76, distribution: 72, oneOnOne: 84, aerialReach: 75
    },
    skills: { reflexes: 90, diving: 88, handling: 76, positioning: 76, kicking: 72, speed: 78 },
    equipment: { gloves: 'Nike Vapor', boots: 'Nike Phantom', jersey: 'Kayserispor 23/24 GK' },
    reviews: []
  },
  {
    id: 'gk10',
    name: 'Gökhan Akkan',
    height: '1.88m',
    age: 29,
    rating: 4.2,
    fee: 450,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    recentAwards: 'Refleks',
    style: 'Panter',
    bio: 'Anadolu takımlarında gösterdiği istikrarlı performansla tanınır.',
    preferredZones: ['Rize', 'Ümraniye'],
    isElite: false,
    coordinates: { lat: 41.065, lng: 29.018 },
    stats: {
      savePercentage: '82', cleanSheets: 4, penaltySaveRate: '15',
      reflexes: 88, diving: 85, positioning: 75, distribution: 70, oneOnOne: 82, aerialReach: 78
    },
    skills: { reflexes: 88, diving: 85, handling: 75, positioning: 75, kicking: 70, speed: 75 },
    equipment: { gloves: 'Uhlsport', boots: 'Adidas X', jersey: 'Rizespor 23/24 GK' },
    reviews: []
  }
];

export const REFEREES: Referee[] = [
  {
    id: 'ref1',
    name: 'Hakem Can Ö.',
    level: 'FIFA',
    matchCount: 150,
    fee: 950,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    rating: 4.9,
    style: 'Otoriter',
    bio: 'Uluslararası tecrübe, hatasız yönetim.',
    preferredZones: ['İstanbul Geneli'],
    isElite: true,
    coordinates: { lat: 41.058, lng: 29.002 },
    stats: {
      avgCards: 3.2, avgDistance: '11km',
      authority: 98, fitness: 95, communication: 92
    },
    reviews: []
  },
  {
    id: 'ref2',
    name: 'Hakem Serkan K.',
    level: 'Süper Lig',
    matchCount: 120,
    fee: 800,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    rating: 4.7,
    style: 'Dengeli',
    bio: 'Oyunu okuyan, pozisyonlara yakın hakem.',
    preferredZones: ['Beşiktaş'],
    isElite: true,
    coordinates: { lat: 41.050, lng: 29.010 },
    stats: {
      avgCards: 4.1, avgDistance: '10.5km',
      authority: 92, fitness: 88, communication: 96
    },
    reviews: []
  },
  {
    id: 'ref3',
    name: 'Hakem Oğuz D.',
    level: 'FIFA',
    matchCount: 80,
    fee: 900,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    rating: 4.8,
    style: 'Modern',
    bio: 'Yeni nesil hakemliğin öncüsü.',
    preferredZones: ['İzmir'],
    coordinates: { lat: 41.047, lng: 29.025 },
    stats: {
      avgCards: 3.8, avgDistance: '12km',
      authority: 90, fitness: 98, communication: 94
    },
    reviews: []
  },
  {
    id: 'ref4',
    name: 'Hakem Yasin A.',
    level: 'FIFA',
    matchCount: 95,
    fee: 700,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    rating: 4.4,
    style: 'Sert',
    bio: 'Tavizsiz yönetim anlayışı.',
    preferredZones: ['Ankara'],
    coordinates: { lat: 41.085, lng: 29.015 },
    stats: {
      avgCards: 5.2, avgDistance: '10km',
      authority: 95, fitness: 85, communication: 80
    },
    reviews: []
  },
  {
    id: 'ref5',
    name: 'Hakem Volkan E.',
    level: 'FIFA',
    matchCount: 70,
    fee: 650,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    rating: 4.5,
    style: 'Teknik',
    bio: 'VAR tecrübesi yüksek.',
    preferredZones: ['Kayseri'],
    coordinates: { lat: 41.055, lng: 28.998 },
    stats: {
      avgCards: 3.5, avgDistance: '10.8km',
      authority: 85, fitness: 90, communication: 92
    },
    reviews: []
  },
  {
    id: 'ref6',
    name: 'Hakem Mert K.',
    level: 'Süper Lig',
    matchCount: 110,
    fee: 750,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    rating: 4.6,
    style: 'Sakin',
    bio: 'Oyuncularla diyaloğu güçlü.',
    preferredZones: ['İstanbul'],
    coordinates: { lat: 41.088, lng: 29.028 },
    stats: {
      avgCards: 2.8, avgDistance: '9.5km',
      authority: 82, fitness: 80, communication: 98
    },
    reviews: []
  },
  {
    id: 'ref7',
    name: 'Hakem Barış K.',
    level: 'FIFA',
    matchCount: 65,
    fee: 600,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    rating: 4.3,
    style: 'Dinamik',
    bio: 'Genç ve atletik.',
    preferredZones: ['Bursa'],
    coordinates: { lat: 41.067, lng: 29.043 },
    stats: {
      avgCards: 4.0, avgDistance: '11.5km',
      authority: 80, fitness: 95, communication: 85
    },
    reviews: []
  },
  {
    id: 'ref8',
    name: 'Atilla Karaoğlan',
    level: 'FIFA',
    matchCount: 60,
    fee: 550,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    rating: 4.4,
    style: 'Dengeli',
    bio: 'Pozisyonlara yakınlığıyla bilinir.',
    preferredZones: ['Sakarya'],
    coordinates: { lat: 41.065, lng: 29.018 },
    stats: {
      avgCards: 3.9, avgDistance: '11.2km',
      authority: 88, fitness: 92, communication: 88
    },
    reviews: []
  },
  {
    id: 'ref9',
    name: 'Zorbay Küçük',
    level: 'FIFA',
    matchCount: 55,
    fee: 500,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    rating: 4.2,
    style: 'Agresif',
    bio: 'Sahada otoritesini hissettirir.',
    preferredZones: ['Adana'],
    coordinates: { lat: 41.060, lng: 29.012 },
    stats: {
      avgCards: 4.8, avgDistance: '11.8km',
      authority: 92, fitness: 94, communication: 75
    },
    reviews: []
  },
  {
    id: 'ref10',
    name: 'Hakem Efe G.',
    level: 'Süper Lig',
    matchCount: 140,
    fee: 600,
    avatar: 'https://i.pravatar.cc/150?u=placeholder',
    rating: 4.5,
    style: 'Tecrübeli',
    bio: 'Yılların verdiği güven.',
    preferredZones: ['İstanbul'],
    coordinates: { lat: 41.058, lng: 29.035 },
    stats: {
      avgCards: 3.4, avgDistance: '9.8km',
      authority: 90, fitness: 75, communication: 90
    },
    reviews: []
  }
];

export const PITCHES: Pitch[] = [
  // ── GERÇEK BEŞİKTAŞ HALIŞAHALARI (Google Maps) ──────────────────
  {
    id: 'bsk1',
    name: 'Merkez Spor Tesisi',
    district: 'Beşiktaş',
    location: 'Beşiktaş, İstanbul',
    distance: '0.3 km',
    rating: 4.6,
    googleRating: 4.6,
    googleReviews: 312,
    pricePerPerson: 250,
    totalPrice: 3500,
    image: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=1000',
    images: [
      'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1510566337590-2fc1f21d0faa?auto=format&fit=crop&q=80&w=1000'
    ],
    description: "Semtin göbeğinde, ulaşımı kolay, yepyeni suni çim zeminli profesyonel standartlarda halı saha tesisi. Maç sonrasında dinlenebileceğiniz geniş kafe alanı mevcuttur.",
    amenities: ['Duş', 'Otopark', 'Soyunma Odası', 'Su'],
    lighting: 90,
    grassQuality: 88,
    lockerRoomQuality: 85,
    goalQuality: 87,
    occupancy: 78,
    lightingGrade: 'A',
    grassGrade: 'B',
    lockerRoomGrade: 'A',
    coordinates: { lat: 41.0433, lng: 29.0057 },
    slots: generateSlots(),
    courts: [
      { 
        id: 'bsk1c1', 
        name: 'Saha 1', 
        type: 'OPEN', 
        price: 3500, 
        slots: generateSlots(),
        description: 'Tesisimizin ana sahası. Son jenerasyon FIFA onaylı suni çim ve güçlü LED aydınlatma ile gece maçları için ideal.',
        features: ['FIFA Onaylı Zemin', 'Skorbord', '4k Kamera'],
        images: ['https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?auto=format&fit=crop&q=80&w=1000'],
        lighting: 92,
        grassQuality: 98,
        lockerRoomQuality: 88,
      },
    ]
  },
  {
    id: 'bsk2',
    name: 'BJK RAMADA Futbol Sahası',
    district: 'Beşiktaş',
    location: 'Dolmabahçe Cad. No:4, Beşiktaş',
    distance: '0.7 km',
    rating: 4.4,
    googleRating: 4.3,
    googleReviews: 189,
    pricePerPerson: 215,
    totalPrice: 3000,
    image: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&q=80&w=1000',
    images: [
      'https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&q=80&w=1000'
    ],
    description: 'Dolmabahçe Sarayı\'na komşu, elit oyuncular için özel tasarlanmış kapalı alan. Hava koşullarından etkilenmeden dört mevsim kesintisiz futbol deneyimi.',
    amenities: ['Soyunma Odası', 'Otopark', 'Kafe'],
    lighting: 82,
    grassQuality: 80,
    lockerRoomQuality: 78,
    goalQuality: 80,
    occupancy: 62,
    lightingGrade: 'B',
    grassGrade: 'B',
    lockerRoomGrade: 'C',
    coordinates: { lat: 41.0396, lng: 29.0027 },
    slots: generateSlots(),
    courts: [
      { 
        id: 'bsk2c1', 
        name: 'Ramada Saha 1', 
        type: 'CLOSED', 
        price: 3000, 
        slots: generateSlots(),
        description: 'Klimalı ve havalandırmalı özel kapalı saha. Yumuşak kauçuk zemin yapısı ile sakatlık riskini minimuma indirir.',
        features: ['Kapalı Tavan', 'Isıtma/Soğutma', 'Özel Tribün'],
        images: ['https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&q=80&w=1000'],
        lighting: 85,
        grassQuality: 82,
        lockerRoomQuality: 90,
      },
    ]
  },
  {
    id: 'bsk3',
    name: 'Çırağan Halı Saha Kompleksi',
    district: 'Beşiktaş',
    location: 'Çırağan Cad. No:32, Beşiktaş',
    distance: '1.1 km',
    rating: 4.8,
    googleRating: 4.8,
    googleReviews: 541,
    pricePerPerson: 285,
    totalPrice: 4000,
    image: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&q=80&w=1000',
    images: [
      'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&q=80&w=1000'
    ],
    description: 'İstanbul\'un en lüks spor komplekslerinden biri. Çırağan manzarası eşliğinde hem açık hem de kapalı sahalar sunar. Soyunma odalarındaki jakuzi ve özel vale hizmeti ile fark yaratır.',
    amenities: ['Duş', 'Soyunma Odası', 'Otopark', 'Kafe', 'WiFi', 'Kamera Kaydı'],
    lighting: 96,
    grassQuality: 95,
    lockerRoomQuality: 93,
    goalQuality: 92,
    occupancy: 90,
    lightingGrade: 'A',
    grassGrade: 'A',
    lockerRoomGrade: 'A',
    coordinates: { lat: 41.0482, lng: 29.0098 },
    slots: generateSlots(),
    courts: [
      { 
        id: 'bsk3c1', 
        name: 'Çırağan 1 (Kapalı)', 
        type: 'CLOSED', 
        price: 4000, 
        slots: generateSlots(),
        description: 'Yüksek tavanlı panaromik cam duvarlara sahip kapalı lüks VIP saha.',
        features: ['VIP Soyunma', 'Yerden Isıtma', 'Tartan Zemin'],
        images: ['https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&q=80&w=1000'],
        lighting: 98,
        grassQuality: 96,
        lockerRoomQuality: 98,
      },
      { 
        id: 'bsk3c2', 
        name: 'Çırağan 2 (Açık)', 
        type: 'OPEN', 
        price: 3600, 
        slots: generateSlots(),
        description: 'Boğaz havası almak isteyenler için geniş açık saha.',
        features: ['Boğaz Manzarası', 'Akıllı Çim', 'Deplasman Tribünü'],
        images: ['https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&q=80&w=1000'],
        lighting: 94,
        grassQuality: 92,
        lockerRoomQuality: 95,
      },
    ]
  },
  // ── DİĞER SAHALAR ────────────────────────────────────────────────
  {
    id: '1',
    name: 'Arena Sport Center',
    district: 'Beşiktaş',
    location: 'Fulya, Beşiktaş',
    distance: '1.2 km',
    rating: 4.9,
    googleRating: 4.8,
    googleReviews: 1240,
    pricePerPerson: 285,
    totalPrice: 4000,
    image: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=1000',
    images: [
      'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=1000',
      'https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?auto=format&fit=crop&q=80&w=1000'
    ],
    amenities: ['Duş', 'Otopark', 'Kafe', 'WiFi', 'Kamera Kaydı'],
    lighting: 98,
    grassQuality: 96,
    lockerRoomQuality: 94,
    goalQuality: 92,
    occupancy: 95,
    lightingGrade: 'A',
    grassGrade: 'A',
    lockerRoomGrade: 'A',
    coordinates: { lat: 41.058, lng: 29.002 },
    slots: generateSlots(),
    courts: [
      { id: 'c1', name: 'Saha 1 (Kapalı)', type: 'CLOSED', price: 4000, slots: generateSlots() },
      { id: 'c2', name: 'Saha 2 (Açık)', type: 'OPEN', price: 3600, slots: generateSlots() },
      { id: 'c3', name: 'Saha 3 (Açık)', type: 'OPEN', price: 3600, slots: generateSlots() }
    ]
  },
  {

    id: '2',
    name: 'Yıldız Spor Tesisleri',
    district: 'Beşiktaş',
    location: 'Yıldız, Beşiktaş',
    distance: '0.8 km',
    rating: 4.7,
    googleRating: 4.6,
    googleReviews: 850,
    pricePerPerson: 250,
    totalPrice: 3500,
    image: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&q=80&w=1000',
    images: [],
    amenities: ['Duş', 'Otopark', 'Ekipman'],
    lighting: 90,
    grassQuality: 92,
    lockerRoomQuality: 85,
    goalQuality: 88,
    occupancy: 45,
    coordinates: { lat: 41.050, lng: 29.010 },
    slots: generateSlots(),
    courts: [
      { id: 'c4', name: 'Ana Saha', type: 'OPEN', price: 3500, slots: generateSlots() },
      { id: 'c5', name: 'Antrenman Sahası', type: 'OPEN', price: 3000, slots: generateSlots() }
    ]
  },
  {
    id: '3',
    name: 'Ortaköy Halı Saha',
    district: 'Beşiktaş',
    location: 'Ortaköy, Beşiktaş',
    distance: '2.5 km',
    rating: 4.2,
    googleRating: 4.1,
    googleReviews: 420,
    pricePerPerson: 200,
    totalPrice: 2800,
    image: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&q=80&w=1000',
    images: [],
    amenities: ['Otopark'],
    lighting: 75,
    grassQuality: 70,
    lockerRoomQuality: 65,
    goalQuality: 75,
    occupancy: 65,
    coordinates: { lat: 41.047, lng: 29.025 },
    slots: generateSlots(),
    courts: [
      { id: 'c6', name: 'Ortaköy 1', type: 'OPEN', price: 2800, slots: generateSlots() },
      { id: 'c7', name: 'Ortaköy 2', type: 'OPEN', price: 2800, slots: generateSlots() }
    ]
  },
  {
    id: '4',
    name: 'Merkez Spor Tesisi',
    district: 'Beşiktaş',
    location: 'Levent, Beşiktaş',
    distance: '3.1 km',
    rating: 4.5,
    googleRating: 4.4,
    googleReviews: 670,
    pricePerPerson: 220,
    totalPrice: 3100,
    image: 'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&q=80&w=1000',
    images: [],
    amenities: ['Duş', 'Kamera Kaydı'],
    lighting: 88,
    grassQuality: 85,
    lockerRoomQuality: 80,
    goalQuality: 82,
    occupancy: 82,
    coordinates: { lat: 41.085, lng: 29.015 },
    slots: generateSlots(),
    courts: [
      { id: 'c8', name: 'Levent 1', type: 'OPEN', price: 3100, slots: generateSlots() },
      { id: 'c9', name: 'Levent 2 (Kapalı)', type: 'CLOSED', price: 3400, slots: generateSlots() }
    ]
  },
  {
    id: '5',
    name: 'Fulya Spor Kompleksi',
    district: 'Beşiktaş',
    location: 'Fulya, Beşiktaş',
    distance: '0.5 km',
    rating: 4.8,
    googleRating: 4.7,
    googleReviews: 1100,
    pricePerPerson: 270,
    totalPrice: 3800,
    image: 'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&q=80&w=1000',
    images: [],
    amenities: ['Duş', 'Otopark', 'Kafe', 'WiFi'],
    lighting: 95,
    grassQuality: 94,
    lockerRoomQuality: 90,
    goalQuality: 90,
    occupancy: 88,
    coordinates: { lat: 41.055, lng: 28.998 },
    slots: generateSlots()
  },
  {
    id: '6',
    name: 'Akatlar Arena',
    district: 'Beşiktaş',
    location: 'Akatlar, Beşiktaş',
    distance: '4.2 km',
    rating: 4.6,
    googleRating: 4.5,
    googleReviews: 920,
    pricePerPerson: 240,
    totalPrice: 3400,
    image: 'https://images.unsplash.com/photo-1510566337590-2fc1f21d0faa?auto=format&fit=crop&q=80&w=1000',
    images: [],
    amenities: ['Duş', 'Otopark', 'Kafe'],
    lighting: 92,
    grassQuality: 88,
    lockerRoomQuality: 85,
    goalQuality: 85,
    occupancy: 70,
    coordinates: { lat: 41.088, lng: 29.028 },
    slots: generateSlots()
  },
  {
    id: '7',
    name: 'Arnavutköy Sahil Sahası',
    district: 'Beşiktaş',
    location: 'Arnavutköy, Beşiktaş',
    distance: '3.5 km',
    rating: 4.3,
    googleRating: 4.2,
    googleReviews: 350,
    pricePerPerson: 210,
    totalPrice: 2950,
    image: 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&q=80&w=1000',
    images: [],
    amenities: ['Otopark', 'WiFi'],
    lighting: 80,
    grassQuality: 78,
    lockerRoomQuality: 70,
    goalQuality: 75,
    occupancy: 55,
    coordinates: { lat: 41.067, lng: 29.043 },
    slots: generateSlots()
  },
  {
    id: '8',
    name: 'Levazım Spor Tesisleri',
    district: 'Beşiktaş',
    location: 'Levazım, Beşiktaş',
    distance: '2.1 km',
    rating: 4.4,
    googleRating: 4.3,
    googleReviews: 580,
    pricePerPerson: 230,
    totalPrice: 3200,
    image: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&q=80&w=1000',
    images: [],
    amenities: ['Duş', 'Otopark'],
    lighting: 85,
    grassQuality: 82,
    lockerRoomQuality: 78,
    goalQuality: 80,
    occupancy: 60,
    coordinates: { lat: 41.065, lng: 29.018 },
    slots: generateSlots()
  },
  {
    id: '9',
    name: 'Balmumcu Halı Saha',
    district: 'Beşiktaş',
    location: 'Balmumcu, Beşiktaş',
    distance: '1.5 km',
    rating: 4.1,
    googleRating: 4.0,
    googleReviews: 290,
    pricePerPerson: 205,
    totalPrice: 2850,
    image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&q=80&w=1000',
    images: [],
    amenities: ['Otopark'],
    lighting: 72,
    grassQuality: 75,
    lockerRoomQuality: 62,
    goalQuality: 70,
    occupancy: 40,
    coordinates: { lat: 41.060, lng: 29.012 },
    slots: generateSlots()
  },
  {
    id: '10',
    name: 'Kuruçeşme Park Sahası',
    district: 'Beşiktaş',
    location: 'Kuruçeşme, Beşiktaş',
    distance: '3.8 km',
    rating: 4.5,
    googleRating: 4.4,
    googleReviews: 480,
    pricePerPerson: 225,
    totalPrice: 3150,
    image: 'https://images.unsplash.com/photo-1521733331922-79817d9f3e44?auto=format&fit=crop&q=80&w=1000',
    images: [],
    amenities: ['Duş', 'Otopark', 'Kafe'],
    lighting: 86,
    grassQuality: 84,
    lockerRoomQuality: 82,
    goalQuality: 84,
    occupancy: 75,
    coordinates: { lat: 41.058, lng: 29.035 },
    slots: generateSlots()
  }
];

export const TICKERS = [
  "🐾 HAFTANIN PANTERİ: Volkan Demirel (9.8 Puan)",
  "⚖️ EN ÇOK TERCİH EDİLEN HAKEM: Hakem Can Ö.",
  "⚡ SON 1 SAATTE 12 KALECİ KİRALANDI!",
  "🏆 PRO ÜYELERE ÖZEL %50 KOMİSYON İNDİRİMİ",
  "🔥 ARENA SPORT CENTER'DA BOŞ SAATLER: 22:00, 23:00"
];

export const MOCK_BIDS: IncomingBid[] = [
  {
    id: 'bid-1',
    providerName: 'Kaleci Deniz A.',
    role: 'GOALKEEPER',
    rating: 4.9,
    style: 'Lider',
    bidAmount: 450,
    note: 'Kalede güven istiyorsanız buradayım.',
    avatar: 'https://i.pravatar.cc/150?u=gk2'
  },
  {
    id: 'bid-2',
    providerName: 'Kaleci Baran Y.',
    role: 'GOALKEEPER',
    rating: 4.7,
    style: 'Refleks',
    bidAmount: 350,
    note: 'Hızlı ve çeviğim, maçın kaderini değiştirebilirim.',
    avatar: 'https://i.pravatar.cc/150?u=gk3'
  },
  {
    id: 'bid-3',
    providerName: 'Kaleci Eren K.',
    role: 'GOALKEEPER',
    rating: 4.5,
    style: 'Dengeli',
    bidAmount: 300,
    note: 'Uygun fiyata profesyonel performans.',
    avatar: 'https://i.pravatar.cc/150?u=gk4'
  },
  {
    id: 'bid-4',
    providerName: 'Kaleci Tolga Ş.',
    role: 'GOALKEEPER',
    rating: 4.6,
    style: 'Ayak Hakimiyeti',
    bidAmount: 320,
    note: 'Oyun kuran kaleci arayanlar için.',
    avatar: 'https://i.pravatar.cc/150?u=gk5'
  },
  {
    id: 'bid-5',
    providerName: 'Kaleci Can E.',
    role: 'GOALKEEPER',
    rating: 4.3,
    style: 'Agresif',
    bidAmount: 250,
    note: 'Genç ve dinamik, her topa atlarım.',
    avatar: 'https://i.pravatar.cc/150?u=gk6'
  }
];

export const OWNER_TRANSACTIONS: Transaction[] = [
  { id: 't1', user: 'Ali K.', date: 'Bugün, 14:30', amount: 2800, type: 'BOOKING', status: 'COMPLETED' },
  { id: 't2', user: 'Veli S.', date: 'Dün, 19:00', amount: 150, type: 'ADDON', status: 'COMPLETED' },
  { id: 't3', user: 'Can M.', date: 'Dün, 18:00', amount: 2800, type: 'BOOKING', status: 'COMPLETED' }
];

export const OWNER_REVIEWS: Review[] = [
  {
    id: 'r1', user: 'Hakan T.', rating: 5, comment: 'Zemin harika yenilenmiş, ışıklandırma süper.', date: '2 gün önce',
    metrics: { lighting: 5, grass: 5, goal: 5 }
  },
  {
    id: 'r2', user: 'Emre B.', rating: 4, comment: 'Soyunma odaları biraz daha temiz olabilirdi.', date: '1 hafta önce',
    metrics: { lighting: 4, grass: 5, goal: 3 }
  }
];

export const OWNER_INSIGHTS: BusinessInsight[] = [
  { id: 'i1', type: 'PRICING', title: 'Fiyat Fırsatı', description: 'Bölgedeki rakiplerin %15 üzerinde doluluk var. Akşam saatlerinde fiyatı %10 artırabilirsin.', impact: 'Yüksek' },
  { id: 'i2', type: 'INVENTORY', title: 'Ekipman Stoğu', description: 'Yelek stokları azalıyor, yeni sipariş verilmeli.', impact: 'Orta' },
  { id: 'i3', type: 'INVESTMENT', title: 'Yatırım Önerisi', description: 'Kamera sistemine geçiş yaparsan maç kaydı satışından ek gelir elde edebilirsin.', impact: 'Düşük' }
];

export const MY_TEAM: Team = {
  id: 'team1',
  name: 'Kara Kartallar FC',
  logo: '🦅',
  colors: ['#000000', '#FFFFFF'],
  wins: 12,
  losses: 4,
  playStyle: 'Hücum',
  roster: [
    { id: 'p1', name: 'Burak', avatar: 'https://i.pravatar.cc/150?u=burak', rating: 4.9, position: 'FW', x: 50, y: 22 },
    { id: 'p2', name: 'Can', avatar: 'https://i.pravatar.cc/150?u=can', rating: 4.7, position: 'CM', x: 50, y: 48 },
    { id: 'p3', name: 'Mert', avatar: 'https://i.pravatar.cc/150?u=mert', rating: 4.5, position: 'LM', x: 25, y: 48 },
    { id: 'p4', name: 'Emre', avatar: 'https://i.pravatar.cc/150?u=emre', rating: 4.4, position: 'RM', x: 75, y: 48 },
    { id: 'p5', name: 'Kaya', avatar: 'https://i.pravatar.cc/150?u=kaya', rating: 4.6, position: 'CB', x: 33, y: 73 },
    { id: 'p6', name: 'Ali', avatar: 'https://i.pravatar.cc/150?u=ali', rating: 4.5, position: 'CB', x: 67, y: 73 },
    { id: 'p7', name: 'Volkan', avatar: 'https://i.pravatar.cc/150?u=gk1', rating: 4.8, position: 'GK', x: 50, y: 93 }
  ]
};

// MOCK USER TEAMS FOR PROFILE
export const USER_TEAMS: Team[] = [
  MY_TEAM,
  {
    id: 'team2',
    name: 'Ofis United',
    logo: '💼',
    colors: ['#1E3A8A', '#FFFFFF'],
    wins: 3,
    losses: 1,
    playStyle: 'Dengeli',
    roster: [
      { id: 'p1', name: 'Burak', avatar: 'https://i.pravatar.cc/150?u=burak', rating: 4.9, position: 'FW', x: 50, y: 25 },
      { id: 'p8', name: 'Semih', avatar: 'https://i.pravatar.cc/150?u=semih', rating: 3.5, position: 'DEF', x: 50, y: 80 }
    ]
  }
];

// MOCK FRIENDS FOR ROSTER SELECTION
export const MOCK_FRIENDS: Player[] = [
  { id: 'f1', name: 'Hakan Ç.', avatar: 'https://i.pravatar.cc/150?u=hakan', rating: 4.2, position: 'CM', x: 0, y: 0 },
  { id: 'f2', name: 'Mehmet Y.', avatar: 'https://i.pravatar.cc/150?u=mehmet', rating: 3.8, position: 'CB', x: 0, y: 0 },
  { id: 'f3', name: 'Caner E.', avatar: 'https://i.pravatar.cc/150?u=caner', rating: 4.0, position: 'RW', x: 0, y: 0 },
  { id: 'f4', name: 'Barış A.', avatar: 'https://i.pravatar.cc/150?u=baris', rating: 4.5, position: 'FW', x: 0, y: 0 },
  { id: 'f5', name: 'Ozan K.', avatar: 'https://i.pravatar.cc/150?u=ozan', rating: 3.6, position: 'LB', x: 0, y: 0 },
];

export const UPCOMING_JOBS: JobListing[] = [];

export const DIRECT_OFFERS_MOCK: DirectOffer[] = [
  {
    id: 'do1',
    pitchName: 'Yıldız Halı Saha',
    teamName: 'Fırtına Spor',
    captainName: 'Hakan',
    offerAmount: 350,
    time: '21:00',
    date: 'Bugün',
    message: 'Volkan, sağlam eldiven lazım. Maç çekişmeli olacak.',
    expiresIn: '15dk'
  }
];

export const OPPONENT_LISTINGS: OpponentListing[] = [
  {
    id: 'op1',
    teamName: 'Kuzey Yıldızları',
    teamLogo: 'https://cdn-icons-png.flaticon.com/512/864/864837.png', // Mock Star Logo
    captainName: 'Mert H.',
    captainBadge: 'YARATICI',
    rating: 4.5,
    avgAge: 26,
    level: 'ORTA',
    stats: { aggression: 40, technique: 85 },
    pitchStatus: 'HAS_PITCH',
    pitchDetails: {
      name: 'Arena Sport Center',
      image: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=200',
      location: 'Fulya, Beşiktaş'
    },
    topPlayers: [
      { avatar: 'https://i.pravatar.cc/150?u=p1', role: '🪄' },
      { avatar: 'https://i.pravatar.cc/150?u=p2', role: '🪄' },
      { avatar: 'https://i.pravatar.cc/150?u=p3', role: '🛡️' }
    ],
    description: 'Eksiksiz kadro ile geliyoruz. Keyifli bir maç olsun.',
    location: 'Etiler, İstanbul',
    date: 'Bu Akşam',
    time: '21:00',
    distance: '2.4 km'
  },
  {
    id: 'op2',
    teamName: 'Demir Yumruk FC',
    teamLogo: 'https://cdn-icons-png.flaticon.com/512/1534/1534082.png', // Mock Fist Logo
    captainName: 'Kemal T.',
    captainBadge: 'KAYA',
    rating: 3.8,
    avgAge: 32,
    level: 'HOBİ',
    stats: { aggression: 90, technique: 30 },
    pitchStatus: 'NEEDS_PITCH',
    topPlayers: [
      { avatar: 'https://i.pravatar.cc/150?u=p4', role: '🛡️' },
      { avatar: 'https://i.pravatar.cc/150?u=p5', role: '🛡️' },
      { avatar: 'https://i.pravatar.cc/150?u=p6', role: '⚡' }
    ],
    description: 'Saha sizden, tatlılar bizden. Kondisyonumuz yüksek.',
    location: 'Beşiktaş, İstanbul',
    distance: '1.1 km'
  },
  {
    id: 'op3',
    teamName: 'Genç Yetenekler',
    teamLogo: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png', // Mock Lightning Logo
    captainName: 'Arda G.',
    captainBadge: 'MAESTRO',
    rating: 4.9,
    avgAge: 21,
    level: 'PRO',
    stats: { aggression: 60, technique: 95 },
    pitchStatus: 'SPLIT_PITCH',
    topPlayers: [
      { avatar: 'https://i.pravatar.cc/150?u=p7', role: '👑' },
      { avatar: 'https://i.pravatar.cc/150?u=p8', role: '🔮' },
      { avatar: 'https://i.pravatar.cc/150?u=p9', role: '🔮' }
    ],
    description: 'Hızlı oyun, bol pas. Kendine güvenen rakip arıyoruz.',
    location: 'Şişli / Mecidiyeköy',
    distance: '3.5 km'
  }
];

export const OPEN_JOBS: JobListing[] = [
  {
    id: 'job1',
    type: 'GK',
    pitchName: 'Arena Sport Center',
    location: 'Beşiktaş, İstanbul',
    distance: '2.5 km',
    date: 'Bugün',
    time: '21:00',
    offeredFee: 250,
    captainName: 'Burak',
    teamName: 'Kartallar',
    minRating: 4.0,
    viewers: 12
  },
  {
    id: 'job2',
    type: 'GK',
    pitchName: 'Vadi Spor',
    location: 'Sarıyer',
    distance: '5.0 km',
    date: 'Yarın',
    time: '20:00',
    offeredFee: 200,
    captainName: 'Can',
    teamName: 'Aslanlar',
    minRating: 3.5,
    viewers: 5
  },
  {
    id: 'job3',
    type: 'GK',
    pitchName: 'Florya Park',
    location: 'Bakırköy',
    distance: '12 km',
    date: 'Cuma',
    time: '22:00',
    offeredFee: 300,
    captainName: 'Mert',
    teamName: 'Kanaryalar',
    minRating: 4.2,
    viewers: 8
  }
];

export const WALLET_HISTORY: WalletTransaction[] = [
  { id: 'wx1', date: 'Bugün', description: 'Maç Geliri (Ref)', amount: 250, commission: 25, status: 'PENDING' },
  { id: 'wx2', date: 'Dün', description: 'Maç Geliri (GK)', amount: 150, commission: 15, status: 'CLEARED' },
  { id: 'wx3', date: '22 Mart', description: 'Cüzdana Çekim', amount: -500, commission: 0, status: 'CLEARED' }
];

export const MATCH_HISTORY: MatchHistoryItem[] = [
  {
    id: 'm1',
    date: '24 Mart, 21:00',
    pitchName: 'Arena Sport Center',
    score: '5-3',
    result: 'WIN',
    formation: '2-3-1',
    rosterSnapshot: MY_TEAM.roster,
    personalNote: 'Harika bir maçtı. İkinci yarıda taktik değişikliği işe yaradı.'
  },
  {
    id: 'm2',
    date: '18 Mart, 20:00',
    pitchName: 'Vadi Spor',
    score: '2-4',
    result: 'LOSS',
    formation: '3-2-1',
    rosterSnapshot: MY_TEAM.roster,
    personalNote: 'Defans hattında kopukluklar vardı. Kaya çok yoruldu.'
  }
];

export const MATCH_LISTINGS: MatchListing[] = [
  {
    id: 'ml1',
    title: 'Akşam Kapışması',
    location: 'Arena Sport Center',
    time: '21:00',
    date: 'Bugün',
    price: 200,
    difficulty: 'Rahat',
    minRating: 3.5,
    refereeId: 'uref1',
    image: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&q=80&w=600',
    badges: ['Eksik Var', 'Kaleci Lazım'],
    missingPositions: [{ role: 'KALECİ', count: 1 }, { role: 'SAVUNMA', count: 1 }],
    slots: [
      { id: 's1', role: 'DEF', x: 25, y: 75, status: 'TAKEN', player: { id: 'u1', name: 'Kerem Yılmaz', avatar: 'https://i.pravatar.cc/150?u=kerem2024', position: 'DEF', rating: 4.9 } as any },
      { id: 's2', role: 'GK', x: 50, y: 90, status: 'TAKEN', player: { id: 'ugk1', name: 'Kaleci Deniz A.', avatar: 'https://i.pravatar.cc/150?u=placeholder', position: 'GK', rating: 4.9 } as any },
      { id: 's3', role: 'DEF', x: 75, y: 75, status: 'TAKEN', player: { id: 'u2', name: 'Burak Demir', avatar: 'https://i.pravatar.cc/150?u=burak2024', position: 'DEF', rating: 4.5 } as any },
      { id: 's4', role: 'MID', x: 20, y: 50, status: 'TAKEN', player: { id: 'u3', name: 'Mert Arslan', avatar: 'https://i.pravatar.cc/150?u=mert2024', position: 'MID', rating: 4.1 } as any },
      { id: 's5', role: 'MID', x: 50, y: 50, status: 'TAKEN', player: { id: 'u4', name: 'Arda Kaya', avatar: 'https://i.pravatar.cc/150?u=arda2024', position: 'MID', rating: 3.8 } as any },
      { id: 's6', role: 'MID', x: 80, y: 50, status: 'TAKEN', player: { id: 'u5', name: 'Emre Çelik', avatar: 'https://i.pravatar.cc/150?u=emre2024', position: 'MID', rating: 4.3 } as any },
      { id: 's7', role: 'FWD', x: 50, y: 25, status: 'TAKEN', player: { id: 'u6', name: 'Cenk Tosun', avatar: 'https://i.pravatar.cc/150?u=cenk', position: 'FWD', rating: 4.6 } as any },
      { id: 's8', role: 'DEF', x: 10, y: 75, status: 'TAKEN', player: { id: 'u7', name: 'Ozan Kabak', avatar: 'https://i.pravatar.cc/150?u=ozan', position: 'DEF', rating: 4.7 } as any },
      { id: 's9', role: 'MID', x: 30, y: 50, status: 'TAKEN', player: { id: 'u8', name: 'Kerem Akturk', avatar: 'https://i.pravatar.cc/150?u=kerema', position: 'FWD', rating: 4.8 } as any },
      { id: 's10', role: 'MID', x: 70, y: 50, status: 'TAKEN', player: { id: 'u10', name: 'İrfan', avatar: 'https://i.pravatar.cc/150?u=irfan', position: 'MID', rating: 4.6 } as any },
      { id: 's11', role: 'MID', x: 90, y: 50, status: 'TAKEN', player: { id: 'u11', name: 'Fred', avatar: 'https://i.pravatar.cc/150?u=fred', position: 'MID', rating: 4.9 } as any },
      { id: 's12', role: 'FWD', x: 30, y: 25, status: 'TAKEN', player: { id: 'u12', name: 'Dzeko', avatar: 'https://i.pravatar.cc/150?u=dzeko', position: 'FWD', rating: 4.8 } as any },
      { id: 's13', role: 'FWD', x: 70, y: 25, status: 'TAKEN', player: { id: 'u13', name: 'Ahmetcan', avatar: 'https://i.pravatar.cc/150?u=ahmetcan', position: 'DEF', rating: 4.2 } as any },
      { id: 's14', role: 'GK', x: 50, y: 10, status: 'OPEN' }
    ]
  },
  {
    id: 'ml2',
    title: 'Haftalık Rutin',
    location: 'Vadi Spor Tesisleri',
    time: '20:00',
    date: 'Bugün',
    price: 250,
    difficulty: 'Taktiksel',
    minRating: 4.5,
    image: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&q=80&w=600',
    badges: ['Yüksek Seviye', 'Hakemli'],
    missingPositions: [{ role: 'ORTA SAHA', count: 2 }],
    slots: [
      { id: 's1', role: 'DEF', x: 25, y: 75, status: 'TAKEN', player: { id: 'u1', name: 'Kerem Yılmaz', avatar: 'https://i.pravatar.cc/150?u=kerem2024', position: 'DEF', rating: 4.9 } as any },
      { id: 's2', role: 'GK', x: 50, y: 90, status: 'TAKEN', player: { id: 'ugk1', name: 'Kaleci D.', avatar: 'https://i.pravatar.cc/150?u=muslera', position: 'GK', rating: 4.9 } as any },
      { id: 's3', role: 'DEF', x: 75, y: 75, status: 'TAKEN', player: { id: 'u7', name: 'Ozan Kabak', avatar: 'https://i.pravatar.cc/150?u=ozan', position: 'DEF', rating: 4.7 } as any },
      { id: 's4', role: 'MID', x: 20, y: 50, status: 'TAKEN', player: { id: 'u8', name: 'Kerem Akturk', avatar: 'https://i.pravatar.cc/150?u=kerema', position: 'FWD', rating: 4.8 } as any },
      { id: 's5', role: 'MID', x: 50, y: 50, status: 'TAKEN', player: { id: 'u10', name: 'İrfan', avatar: 'https://i.pravatar.cc/150?u=irfan', position: 'MID', rating: 4.6 } as any },
      { id: 's6', role: 'MID', x: 80, y: 50, status: 'TAKEN', player: { id: 'u11', name: 'Fred', avatar: 'https://i.pravatar.cc/150?u=fred', position: 'MID', rating: 4.9 } as any },
      { id: 's7', role: 'FWD', x: 50, y: 25, status: 'TAKEN', player: { id: 'u12', name: 'Dzeko', avatar: 'https://i.pravatar.cc/150?u=dzeko', position: 'FWD', rating: 4.8 } as any },
      { id: 's8', role: 'MID', x: 30, y: 50, status: 'TAKEN', player: { id: 'u3', name: 'Mert Arslan', avatar: 'https://i.pravatar.cc/150?u=mert2024', position: 'MID', rating: 4.1 } as any },
      { id: 's9', role: 'DEF', x: 35, y: 75, status: 'TAKEN', player: { id: 'u9', name: 'Serdar', avatar: 'https://i.pravatar.cc/150?u=serdar', position: 'DEF', rating: 4.3 } as any },
      { id: 's10', role: 'FWD', x: 70, y: 25, status: 'TAKEN', player: { id: 'u13', name: 'Ahmetcan', avatar: 'https://i.pravatar.cc/150?u=ahmetcan', position: 'DEF', rating: 4.2 } as any },
      { id: 's11', role: 'MID', x: 10, y: 50, status: 'OPEN' },
      { id: 's12', role: 'MID', x: 90, y: 50, status: 'OPEN' },
      { id: 's13', role: 'DEF', x: 55, y: 75, status: 'OPEN' },
      { id: 's14', role: 'GK', x: 50, y: 10, status: 'OPEN' }
    ]
  },
  {
    id: 'ml3',
    title: 'Derbi Maçı',
    location: 'Yıldız Halı Saha',
    time: '22:00',
    date: 'Bugün',
    price: 180,
    difficulty: 'Ciddi',
    minRating: 4.1,
    image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=600',
    badges: ['Gece Maçı', 'Eğlencesine'],
    missingPositions: [],
    slots: [
      { id: 's1', role: 'DEF', x: 25, y: 75, status: 'TAKEN', player: { id: 'u1', name: 'Kerem Yılmaz', avatar: 'https://i.pravatar.cc/150?u=kerem2024', position: 'DEF', rating: 4.9 } as any },
      { id: 's2', role: 'GK', x: 50, y: 90, status: 'TAKEN', player: { id: 'ugk1', name: 'Kaleci Deniz A.', avatar: 'https://i.pravatar.cc/150?u=muslera', position: 'GK', rating: 4.9 } as any },
      { id: 's3', role: 'DEF', x: 75, y: 75, status: 'TAKEN', player: { id: 'u2', name: 'Burak Demir', avatar: 'https://i.pravatar.cc/150?u=burak2024', position: 'DEF', rating: 4.5 } as any },
      { id: 's4', role: 'MID', x: 20, y: 50, status: 'TAKEN', player: { id: 'u3', name: 'Mert Arslan', avatar: 'https://i.pravatar.cc/150?u=mert2024', position: 'MID', rating: 4.1 } as any },
      { id: 's5', role: 'MID', x: 50, y: 50, status: 'TAKEN', player: { id: 'u4', name: 'Arda Kaya', avatar: 'https://i.pravatar.cc/150?u=arda2024', position: 'MID', rating: 3.8 } as any },
      { id: 's6', role: 'MID', x: 80, y: 50, status: 'TAKEN', player: { id: 'u5', name: 'Emre Çelik', avatar: 'https://i.pravatar.cc/150?u=emre2024', position: 'MID', rating: 4.3 } as any },
      { id: 's7', role: 'FWD', x: 50, y: 25, status: 'TAKEN', player: { id: 'u6', name: 'Cenk Tosun', avatar: 'https://i.pravatar.cc/150?u=cenk', position: 'FWD', rating: 4.6 } as any },
      { id: 's8', role: 'DEF', x: 10, y: 75, status: 'TAKEN', player: { id: 'u7', name: 'Ozan Kabak', avatar: 'https://i.pravatar.cc/150?u=ozan', position: 'DEF', rating: 4.7 } as any },
      { id: 's9', role: 'MID', x: 30, y: 50, status: 'TAKEN', player: { id: 'u8', name: 'Kerem Akturk', avatar: 'https://i.pravatar.cc/150?u=kerema', position: 'FWD', rating: 4.8 } as any },
      { id: 's10', role: 'MID', x: 70, y: 50, status: 'TAKEN', player: { id: 'u10', name: 'İrfan', avatar: 'https://i.pravatar.cc/150?u=irfan', position: 'MID', rating: 4.6 } as any },
      { id: 's11', role: 'MID', x: 90, y: 50, status: 'TAKEN', player: { id: 'u11', name: 'Fred', avatar: 'https://i.pravatar.cc/150?u=fred', position: 'MID', rating: 4.9 } as any },
      { id: 's12', role: 'FWD', x: 30, y: 25, status: 'TAKEN', player: { id: 'u12', name: 'Dzeko', avatar: 'https://i.pravatar.cc/150?u=dzeko', position: 'FWD', rating: 4.8 } as any },
      { id: 's13', role: 'FWD', x: 70, y: 25, status: 'TAKEN', player: { id: 'u13', name: 'Ahmetcan', avatar: 'https://i.pravatar.cc/150?u=ahmetcan', position: 'DEF', rating: 4.2 } as any },
      { id: 's14', role: 'GK', x: 50, y: 10, status: 'TAKEN', player: { id: 'ugk2', name: 'Kaleci O.', avatar: 'https://i.pravatar.cc/150?u=liva', position: 'GK', rating: 4.8 } as any }
    ]
  },
  {
    id: 'ml4',
    title: 'Şampiyonlar Ligi',
    location: 'Maslak İTÜ',
    time: '19:00',
    date: 'Pazar',
    price: 300,
    difficulty: 'Ciddi',
    minRating: 4.8, // KİLİTLİ
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=600',
    badges: ['Turnuva', 'Ödüllü'],
    missingPositions: [{ role: 'SAVUNMA', count: 2 }, { role: 'KALECİ', count: 1 }],
    // 8v8 Home Only
    slots: [
      { id: 's1', role: 'GK', x: 50, y: 90, status: 'OPEN' },
      { id: 's2', role: 'DEF', x: 20, y: 75, status: 'OPEN' },
      { id: 's3', role: 'DEF', x: 50, y: 75, status: 'OPEN' },
      { id: 's4', role: 'DEF', x: 80, y: 75, status: 'TAKEN', player: { id: 'u16', name: 'Maldini', avatar: 'https://i.pravatar.cc/150?u=maldini', position: 'DEF', rating: 5.0, x: 80, y: 75 } as any },
      { id: 's5', role: 'MID', x: 20, y: 50, status: 'TAKEN', player: { id: 'u17', name: 'Gattuso', avatar: 'https://i.pravatar.cc/150?u=gattuso', position: 'MID', rating: 4.9, x: 20, y: 50 } as any },
      { id: 's6', role: 'MID', x: 50, y: 50, status: 'TAKEN', player: { id: 'u18', name: 'Pirlo', avatar: 'https://i.pravatar.cc/150?u=pirlo', position: 'MID', rating: 5.0, x: 50, y: 50 } as any },
      { id: 's7', role: 'MID', x: 80, y: 50, status: 'TAKEN', player: { id: 'u19', name: 'Seedorf', avatar: 'https://i.pravatar.cc/150?u=seedorf', position: 'MID', rating: 4.8, x: 80, y: 50 } as any },
      { id: 's8', role: 'FWD', x: 50, y: 25, status: 'TAKEN', player: { id: 'u20', name: 'Shevchenko', avatar: 'https://i.pravatar.cc/150?u=sheva', position: 'FWD', rating: 5.0, x: 50, y: 25 } as any },
    ]
  },
  {
    id: 'ml5',
    title: 'Dostluk Maçı',
    location: 'Üsküdar Sahil',
    time: '18:00',
    date: 'Bugün',
    price: 0, // Ücretsiz maç gösterimi
    difficulty: 'Rahat',
    minRating: 2.5,
    image: 'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&q=80&w=600',
    badges: ['Yeni Başlayanlar', 'Rahat'],
    missingPositions: [{ role: 'ORTA SAHA', count: 1 }, { role: 'SAVUNMA', count: 1 }],
    // 7v7 Sadece Home
    slots: [
      { id: 's1', role: 'GK', x: 50, y: 90, status: 'TAKEN', player: { id: 'u21', name: 'Volkan', avatar: 'https://i.pravatar.cc/150?u=volkan', position: 'GK', rating: 3.5, x: 50, y: 90 } as any },
      { id: 's2', role: 'DEF', x: 25, y: 75, status: 'TAKEN', player: { id: 'u22', name: 'Serkan', avatar: 'https://i.pravatar.cc/150?u=serkan', position: 'DEF', rating: 3.2, x: 25, y: 75 } as any },
      { id: 's3', role: 'DEF', x: 75, y: 75, status: 'OPEN' },
      { id: 's4', role: 'MID', x: 20, y: 50, status: 'TAKEN', player: { id: 'u23', name: 'Hasan', avatar: 'https://i.pravatar.cc/150?u=hasan', position: 'MID', rating: 3.8, x: 20, y: 50 } as any },
      { id: 's5', role: 'MID', x: 50, y: 50, status: 'TAKEN', player: { id: 'u24', name: 'Kemal', avatar: 'https://i.pravatar.cc/150?u=kemal', position: 'MID', rating: 3.1, x: 50, y: 50 } as any },
      { id: 's6', role: 'MID', x: 80, y: 50, status: 'OPEN' },
      { id: 's7', role: 'FWD', x: 50, y: 25, status: 'TAKEN', player: { id: 'u25', name: 'Onur', avatar: 'https://i.pravatar.cc/150?u=onur', position: 'FWD', rating: 3.6, x: 50, y: 25 } as any },
    ]
  },
  {
    id: 'ml_draft1',
    title: 'Süper Lig Derbisi Maçı',
    location: 'Maslak İTÜ Arena',
    time: '22:00',
    date: 'Bugün',
    price: 220,
    difficulty: 'Ciddi',
    minRating: 4.1,
    image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=600',
    badges: ['FUT Özel', 'Kadro Eksik'],
    status: 'CANCELLED',
    cancelReason: 'Bu maç için yeterli doluluk sağlanamadı.',
    refundStatus: 'Ücret alınmadı',
    missingPositions: [{ role: 'ORTA SAHA', count: 1 }],
    // 7v7 Home
    slots: [
      { id: 's1', role: 'KL', x: 50, y: 90, status: 'TAKEN', player: { id: '3', name: 'Mert Arslan', avatar: 'https://i.pravatar.cc/150?u=mert', position: 'KL', rating: 4.5, style: 'Refleks' } as any },
      { id: 's2', role: 'SAV', x: 25, y: 75, status: 'TAKEN', player: { id: '2', name: 'Emre Demir', avatar: 'https://i.pravatar.cc/150?u=emre', position: 'STP', rating: 4.2, style: 'Duvar' } as any },
      { id: 's3', role: 'SAV', x: 75, y: 75, status: 'OPEN' },
      { id: 's4', role: 'ORT', x: 20, y: 50, status: 'TAKEN', player: { id: '5', name: 'Cem Yıldız', avatar: 'https://i.pravatar.cc/150?u=cem', position: 'OS', rating: 4.0, style: 'Maestro' } as any },
      { id: 's5', role: 'ORT', x: 50, y: 50, status: 'OPEN' },
      { id: 's6', role: 'ORT', x: 80, y: 50, status: 'OPEN' },
      { id: 's7', role: 'HÜC', x: 50, y: 25, status: 'TAKEN', player: { id: '4', name: 'Ahmet Yılmaz', avatar: 'https://i.pravatar.cc/150?u=ahmet', position: 'SNT', rating: 4.8, style: 'Fuleli' } as any }
    ]
  },
  {
    id: 'ml_draft1_2',
    title: 'Yıldız Spor Tesisleri Maçı',
    location: 'Beşiktaş, İstanbul',
    time: '20:00',
    date: 'Bugün',
    price: 200,
    difficulty: 'Rahat',
    minRating: 3.5,
    refereeId: 'uref2',
    image: 'https://images.unsplash.com/photo-1575361204480-aadea2559ee2?q=80&w=600',
    badges: ['Halı Saha', 'Akşam Maçı'],
    status: 'CANCELLED',
    cancelReason: 'Bu maç için yeterli doluluk sağlanamadı.',
    refundStatus: 'Ücret alınmadı',
    missingPositions: [],
    slots: [
      { id: 's1', role: 'KL', x: 50, y: 90, status: 'TAKEN', player: { id: 'ugk2', name: 'Kaleci Onur S.', avatar: 'https://i.pravatar.cc/150?u=placeholder', position: 'GK', rating: 4.8 } as any }
    ]
  },
  {
    id: 'ml_draft2',
    title: 'Taktik Kapışma Maçı',
    location: 'Camp Nou Riva',
    time: '20:00',
    date: 'Yarın',
    price: 320,
    difficulty: 'Taktiksel',
    minRating: 3.8,
    image: 'https://images.unsplash.com/photo-1575361204480-aadea2559ee2?q=80&w=600',
    badges: ['Taktiksel', 'Sistem Maçı'],
    status: 'DRAFT',
    missingPositions: [{ role: 'SAVUNMA', count: 1 }],
    // 5v5 Home
    slots: [
      { id: 's1', role: 'KL', x: 50, y: 90, status: 'TAKEN', player: { id: '12', name: 'Oğuzhan Koç', avatar: 'https://i.pravatar.cc/150?u=oguzhan', position: 'KL', rating: 3.8, style: 'Uçan' } as any },
      { id: 's2', role: 'SAV', x: 30, y: 75, status: 'OPEN' },
      { id: 's3', role: 'SAV', x: 70, y: 75, status: 'TAKEN', player: { id: '10', name: 'Sinan Gül', avatar: 'https://i.pravatar.cc/150?u=sinan', position: 'STP', rating: 4.1, style: 'Kaya' } as any },
      { id: 's4', role: 'ORT', x: 50, y: 50, status: 'TAKEN', player: { id: '13', name: 'Alperen Bal', avatar: 'https://i.pravatar.cc/150?u=alperen', position: 'OS', rating: 4.0, style: 'Dinamik' } as any },
      { id: 's5', role: 'HÜC', x: 50, y: 25, status: 'TAKEN', player: { id: '11', name: 'Hakan Çelik', avatar: 'https://i.pravatar.cc/150?u=hakan', position: 'FV', rating: 4.9, style: 'Avcı' } as any }
    ]
  }
];

