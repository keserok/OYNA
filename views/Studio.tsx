import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import {
    ChevronLeft, Users, Save, Plus, Trash2, Minus,
    Shield, Target, Info, Brain, Activity,
    TrendingUp, Send, SaveAll, Star, X, Check,
    PenTool, MousePointer2, Eye, EyeOff, Layout,
    Search, MapPin, UserCheck, Calendar,
    Swords, Type, UserPlus, GripHorizontal, Settings2,
    MessageSquare, Zap, ShieldAlert, Flag, Dumbbell,
    Layers, Gauge, Crosshair, Share2, List, ChevronRight, RotateCw, Hash, Loader2
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { useAppStore } from '../store';
import { FORMATIONS as FORMATIONS_SSOT } from '../utils/formations';
// Küme 3 köprüsü: kanonik takım/kadro okumaları + tek kayıt kapısı
import {
    MyTeamRow, TeamSquadRow, getMyTeams, getTeamSquad, formatLabel,
} from '../services/teamSocialService';
import {
    saveTeamTactic, approveTacticRpc, rejectTacticRpc, getTacticById,
    setTacticShareLink, tacticShareUrl,
} from '../services/tacticSocialService';
import { sendTeamMessage, tacticMessageBody } from '../services/teamChatService';

// Paylaşılan tipler ve sabitler (SSOT)
import type {
    Player, GameIdentity, Archetype, Slot, SquadSize, FormationType,
    TacticState, DrawingLine, StudioTool, PlayMode
} from './studio/types';
import { ARCHETYPES, INSTRUCTIONS } from './studio/types';
// Hafif geometri/sekans yardımcıları — çekirdekte kalır
import { getSmoothPathStr, computeSeqMap } from './studio/pitchGeometry';

// ⚡ GELİŞMİŞ ANİMASYON MODÜLÜ — on-demand (lazy) indirilir.
// Bu chunk yalnız kullanıcı "Gelişmiş Animasyon" butonuna basınca yüklenir,
// böylece ilk yük hafif kalır (düşük telefonlar yorulmasın).
const AdvancedAnimationModule = lazy(() => import('./studio/AdvancedAnimationModule'));
const AnimationToolbar = lazy(() =>
    import('./studio/AdvancedAnimationModule').then(m => ({ default: m.AnimationToolbar }))
);

// --- Constants ---
const ACADEMYS = [
  { t:"Yarım-Alan (Half-Space)",d:"Sen (7) sağ kanatta topla buluştun. Merkez Sahanın (8) koşusuna ve Stoperin (4) reaksiyonuna odaklan.", a:["Zamanlama her şeydir.","8 numara half-space koşusuna başladı.","Stoper (4) onu takip edince merkezde büyük bir delik oluştu!"], p:[{i:8,tm:'blue',sx:50,sy:65,ex:30,ey:20},{i:4,tm:'red',sx:60,sy:30,ex:40,ey:20}], b:{sx:85,sy:55,ex:85,ey:55}, u:{i:7,sx:85,sy:55}, q:"8 Numara topsuz koşuyu attı ve stoperi yerinden oynattı. Sen (7) olarak ne yapmalısın?", o:[{t:"Çizgiye inip ezbere bir orta açmak",c:false},{t:"Stoperin boşalttığı merkeze (Half-Space) doğru topla kat etmek",c:true},{t:"Geriye, sağ beke pas verip tempoyu düşürmek",c:false}], f:"MÜKEMMEL OKUMA! Arkadaşının topsuz koşusu savunmayı bozdu ve iç koridoru sana açtı. Guardiola'nın en temel hücum prensibini uyguladın.", trg:{x:60,y:35,l:"Açık Alan"}},
  { t:"Sahte 9 İşleyişi",d:"Santrforun (9) hücum hattından ayrılıp derine gelmesini izle.", a:["9 Numara stoperlerin kucağından kurtulup derine geliyor.","Rakip stoper (5) onu yalnız bırakmamak için takip etti.","Savunma arkasında devasa bir koridor açıldı!"], p:[{i:9,tm:'blue',sx:50,sy:30,ex:50,ey:55},{i:5,tm:'red',sx:50,sy:25,ex:50,ey:50},{i:2,tm:'red',sx:80,sy:25,ex:80,ey:25}], b:{sx:40,sy:70,ex:40,ey:70}, u:{i:11,sx:20,sy:40}, q:"Sahte 9 (Santrfor) geriye gelip stoperi çekti. Sol kanat (11) olarak şimdi ne yapmalısın?", o:[{t:"Stoperin boşalttığı alana diyagonal koşu atmak (Sızma)",c:true},{t:"Çizgide kalıp topu ayağıma beklemek",c:false},{t:"Santrfora yaklaşıp kısa paslaşma denemek",c:false}], f:"KUSURSUZ ZAMANLAMA! Sahte 9'un asıl amacı gol atmak değil, kanat forvetleri topla ceza sahasına sokmaktır.", trg:{x:50,y:20,l:"Sızma Koridoru"}},
  { t:"3. Adam (Third-Man)",d:"Rakamların ve üçgen pas ağının büyüsünü izle. Top 10 numarada.", a:["10 numara, araya direkt 9'a oynuyor.","Rakip savunmanın odağı tamamen topu alan 9'da.","9 numara topu kontrol etmeden tekte duvar olacak."], p:[{i:10,tm:'blue',sx:30,sy:60,ex:30,ey:60},{i:9,tm:'blue',sx:50,sy:30,ex:50,ey:30},{i:4,tm:'red',sx:45,sy:25,ex:45,ey:25}], b:{sx:30,sy:60,ex:50,ey:30}, u:{i:8,sx:70,sy:65}, q:"Top 9'a atıldı. 9 numara duvar olup topu çıkartacak. Sen (8) olarak nereye koşmalısın?", o:[{t:"Olduğum yerde kalıp güvenli pas beklemek",c:false},{t:"Savunma arkasına dikine (Third-man) destek koşusu yapmak",c:true},{t:"Kanada açılıp oyunun yönünü değiştirmek",c:false}], f:"İŞTE BU! 3. adam koşuları savunmaların tespit edemediği, takip etmesi en imkansız ve ölümcül koşulardır.", trg:{x:50,y:40,l:"3. Adam Koşusu"}},
  { t:"İçe Kat Eden Bek",d:"Modern futbolda sağ bekin ekstra bir orta saha oluşunu incele.", a:["Sağ Kanat (7) taç çizgisine basıp alanı maksimum genişletiyor.","Rakip sol bek (3) onu marke etmek için çok açıldı.","Stoper (4) ile sol bek (3) arasındaki boşluk yarıldı."], p:[{i:7,tm:'blue',sx:85,sy:30,ex:85,ey:30},{i:3,tm:'red',sx:65,sy:30,ex:85,ey:30},{i:4,tm:'red',sx:50,sy:20,ex:50,ey:20}], b:{sx:50,sy:60,ex:50,ey:60}, u:{i:2,sx:75,sy:65}, q:"Kanat oyuncun çizgiyi genişletti ve rakip beki dışarı sürükledi. Sağ Bek (2) olarak sen nereye yönelmelisin?", o:[{t:"Kanat oyuncusuna dıştan sıradan bir bindirme yapmak",c:false},{t:"Stoper ile bek arasındaki devasa boşluğa iç koridordan sızmak",c:true},{t:"Savunma güvenliği için kendi yarı sahamı terk etmemek",c:false}], f:"HARİKA OKUMA! Pep Guardiola'nın 'Inverted Fullback' silahını kullandın. Artık bir orta saha gibi oyunu domine ediyorsun.", trg:{x:65,y:30,l:"İç Koridor"}},
  { t:"Kör Nokta (Blind-Side)",d:"Stoperlerin kafasının nereye dönük olduğunu (gövde yönünü) iyi takip et.", a:["Top sağ kanatta (7) ve ceza sahasına orta kesilecek.","Stoperlerin (4, 5) gözü topta, hepsi topa döndü.","Stoperler sırtlarındaki alanı (Blind-side) şu an göremiyorlar."], p:[{i:7,tm:'blue',sx:85,sy:30,ex:85,ey:30},{i:4,tm:'red',sx:50,sy:20,ex:50,ey:20},{i:5,tm:'red',sx:40,sy:20,ex:40,ey:20}], b:{sx:85,sy:30,ex:35,ey:15}, u:{i:9,sx:25,sy:40}, q:"Orta gelmek üzere. Santrfor (9) olarak stoperlerin konumunu nasıl cezalandırmalısın?", o:[{t:"Stoperin görüş alanından çıkıp stoperin ensesine (kör noktasına) sızmak",c:true},{t:"Doğrudan kaleciyle stoper arasına ön direğe depar atmak",c:false},{t:"Yay çevresinde bekleyip seken top aramak",c:false}], f:"AVCI SEZGİSİ! Savunmacı aynı anda hem seni hem topu göremediği için o salise farkıyla golü attın.", trg:{x:35,y:15,l:"Kör Nokta"}},
  { t:"Geriye Çıkarma",d:"Kanattan çizgiye inildiğinde açılan büyük boşluğu analiz et.", a:["Kanat (7) hızla sıfıra, korner direğine iniyor.","Bütün savunmacılar ve kaleci panikle kale ağzına gömüldü.","Yayın tam civarı tertemiz kaldı."], p:[{i:7,tm:'blue',sx:80,sy:30,ex:80,ey:10},{i:4,tm:'red',sx:50,sy:30,ex:55,ey:15},{i:5,tm:'red',sx:40,sy:30,ex:45,ey:15}], b:{sx:80,sy:30,ex:80,ey:10}, u:{i:10,sx:40,sy:60}, q:"Savunma kale çizgisi içine gömüldü. Merkez (10) olarak golü nasıl atarsın?", o:[{t:"Kaleciyle stoper arasına ön direğe dalmak",c:false},{t:"Penaltı noktasına geriye çıkarma (Cut-back) pası için beklemek",c:true},{t:"Arka direğe gidip yüksek orta beklemek",c:false}], f:"ALTIN DEĞERİNDE! Manchester City'nin en çok gol attığı 'Cut-back' bölgesini doldurdun.", trg:{x:50,y:30,l:"Gol Alanı"}},
  { t:"Şok Pres",d:"Topu kaybettiğin ilk %10'luk kısımda verilen refleks çok kritik.", a:["Atağa kalkarken (8) hatalı pas yapıyor.","Kırmızı (8) topu kazandı ve kontratağa geçiyor.","Kırmızı (10), merkezde bomboş pas bekliyor."], p:[{i:8,tm:'blue',sx:30,sy:30,ex:30,ey:30},{i:8,tm:'red',sx:35,sy:35,ex:35,ey:35},{i:10,tm:'red',sx:60,sy:40,ex:60,ey:40}], b:{sx:30,sy:30,ex:35,ey:35}, u:{i:6,sx:50,sy:60}, q:"Top kaybedildi. Bir Ön Libero (6) olarak ilk refleksin ne olmalı?", o:[{t:"Deli gibi topu tutan rakibe basmak",c:false},{t:"Geçiş tehlikesi olan oyuncuya (10) giden pas kanalını kapatmak",c:true},{t:"Depar atıp stoperlerin arasına girmek",c:false}], f:"TAKTİKSEL DEHA! Topa değil, topun gideceği o en tehlikeli ölümcül pas kanalına baskı yaptın.", trg:{x:45,y:40,l:"Pas Kesici"}},
  { t:"Kalan Savunma",d:"Hücumdayken bile takım dengesini (Rest Defense) optimize etmelisin.", a:["Sağ bek (2) hücuma fırtına gibi katıldı.","Geride sadece 2 stoperimiz (4 ve 5) kaldı.","Rakibin en tehlikeli kontratak forveti (9) pusuda."], p:[{i:2,tm:'blue',sx:85,sy:40,ex:85,ey:15},{i:4,tm:'blue',sx:60,sy:70,ex:60,ey:70},{i:5,tm:'blue',sx:40,sy:70,ex:40,ey:70},{i:9,tm:'red',sx:50,sy:50,ex:50,ey:50}], b:{sx:85,sy:20,ex:85,ey:15}, u:{i:3,sx:15,sy:50}, q:"Sağ bek aşırı uçta. Sol Bek (3) olarak olası kontratağı nasıl karşılarsın?", o:[{t:"Merkeze kat edip stoperlerle '3'lü Savunma' hattı oluşturmak",c:true},{t:"Ben de sol kanattan çizgi boyunca ileriye depar atmak",c:false},{t:"Kendi kanadımda çizgide beklemeye devam etmek",c:false}], f:"HARİKA DUVAR! 'Rest Defense' felsefesiyle kontratak ihtimalini bitirdin.", trg:{x:30,y:70,l:"Üçlü Hat"}},
  { t:"Aşırı Yükleme",d:"Bir tarafı çökertmek için rakibi nasıl uyuttuğunuza odaklan.", a:["Sol kanatta kısa paslar, rakibi o bölgeye çekti.","Sağ kanat tamamen terkedildi.","Top sıkışmış gibi görünüyor ama bu bir tuzak."], p:[{i:11,tm:'blue',sx:15,sy:40,ex:15,ey:40},{i:8,tm:'blue',sx:25,sy:45,ex:25,ey:45},{i:6,tm:'red',sx:20,sy:35,ex:20,ey:35},{i:2,tm:'red',sx:30,sy:40,ex:30,ey:40}], b:{sx:15,sy:40,ex:25,ey:45}, u:{i:7,sx:60,sy:45}, q:"Takımın topu sol kanada yığdı. Zıt kanat oyuncusu (7) olarak ne yapmalısın?", o:[{t:"Yardıma gitmek için topun olduğu kanada gelmek",c:false},{t:"En uzak, kireçte (çizgide) bekleyip ters diyagonal top aramak",c:true},{t:"Merkeze yayın oraya gelip ortada seken top beklemek",c:false}], f:"BÜYÜLEYİCİ! 'Overload to Isolate' taktiği... Kendini bilerek yalnız ve 1v1 pozisyona attın.", trg:{x:85,y:30,l:"İzole Alan"}},
  { t:"Sahte Karışıklık (Decoy)",d:"Tüm savunmayı kaosa sürükle ve arka planda işi bitiren ol.", a:["Her iki kanat aniden merkeze, içeriye koşu yapıyor.","Stoperler büyük panikle onlarla derine koşuyor.","Yayın çevresi inanılmaz karıştı!"], p:[{i:7,tm:'blue',sx:80,sy:30,ex:60,ey:20},{i:11,tm:'blue',sx:20,sy:30,ex:40,ey:20},{i:4,tm:'red',sx:60,sy:20,ex:60,ey:20},{i:5,tm:'red',sx:30,sy:20,ex:30,ey:20}], b:{sx:50,sy:45,ex:50,ey:45}, u:{i:10,sx:50,sy:45}, q:"Mükemmel bir koşu trafiği var. Bir On Numara (10) olarak burdan nasıl ekmek yersin?", o:[{t:"Direkt kaleye doğru o kalabalığın içine hızla depar atmak",c:false},{t:"Kaostan çok uzağa geri çekilerek (Drop-off) cepte kalmak",c:true},{t:"Kanatların boşalttığı taç çizgisine doğru savrulmak",c:false}], f:"EFSANEVİ ZEKÂ! Herkes ileri koşarken sen geriye çıkarak kendine devasa bir alan yarattın. Oyunu domine ediyorsun!", trg:{x:50,y:60,l:"Cep (Pocket)"}}
];

const FORMATIONS = FORMATIONS_SSOT as Record<SquadSize, Record<string, Slot[]>>;

// GÜNCEL / Modern Trendler — kendi kendine yeten (backend'siz) gerçek taktik
// içeriği. Her kart açılır-kapanır (accordion); amatör sahaya uyarlama içerir.
type TrendCard = {
    id: string;
    tag: string;
    title: string;
    summary: string;
    icon: 'Layout' | 'Target' | 'Layers';
    accent: 'orange' | 'blue' | 'purple';
    detail: string[];
};
const FEATURED_TREND = {
    id: 'leverkusen',
    tag: 'Haftalık Analiz',
    title: "Leverkusen'in 3-4-2-1 Dominansı",
    summary: "Xabi Alonso'nun dar alanda kurduğu elmas yapısı ve beklerin hücum katkısını amatör sahaya nasıl uyarlarsın?",
    detail: [
        "3-4-2-1, topa sahipken 3 stoperin arkada güven verdiği, iki kanat bekin (wing-back) tüm çizgiyi kat ettiği bir sistemdir. Amatör sahada bu 'iki bek sürekli koşacak' demektir — en dayanıklı iki oyuncunu kanatlara koy.",
        "İki '10 numara' (çift ofansif orta saha) stoperlerle bekler arasındaki yarım-alanlara (half-space) yerleşir. Görevleri pas kanalını açmak ve topu ceza sahasına taşımak. Onlara 'geniş açılmayın, içeride kalın' talimatı ver.",
        "Tek santrfor derinlik verir ve stoperleri meşgul eder; boşalan alana 10'lar sızar. Rakip önde presliyse top 3 stoper arasında sabırla dolaşır — ilk pasta acele etme.",
        "Amatör uyarlama: 7v7'de bunu 1-2-2-1'e indir (kaleci + 2 stoper + 2 kanat + 1 forvet). Prensip aynı kalır: arkada sayı üstünlüğü, kanatlarda genişlik, merkezde çift yaratıcı.",
    ],
};
const MODERN_TRENDS: TrendCard[] = [
    {
        id: 'box-midfield',
        tag: 'Orta saha kurguları',
        title: 'Box Midfields',
        summary: 'Merkezde 2+2 kare (box) yapısıyla orta sahayı ezmek.',
        icon: 'Layout', accent: 'orange',
        detail: [
            "İki derin + iki ileri orta saha bir 'kare' (box) oluşturur. Bu kare merkezde her zaman bir pas üçgeni garantiler — rakip birini kapatınca diğeri boşta kalır.",
            "Beklerin içeri kat etmesiyle (inverted fullback) doğal oluşur: bek içeri gelir, kare tamamlanır, kanat forvete genişlik kalır.",
            "Amatör faydası: top merkezden asla kaybolmaz. 'Her zaman iki pas seçeneğin olsun' kuralını fiziksel olarak zorlar.",
        ],
    },
    {
        id: 'inverted-fullbacks',
        tag: 'Modern bek rolleri',
        title: 'Inverted Fullbacks',
        summary: 'Bekin kanattan içeri, orta sahaya kat etmesi.',
        icon: 'Target', accent: 'blue',
        detail: [
            "Bek, topa sahipken çizgide kalmak yerine orta sahaya (içeri) girer. Takım hücumdayken 3 stoper + fazladan bir orta saha ile oynar; kontratağa karşı 'rest defense' (dinlenen savunma) kurulur.",
            "Kanat genişliğini artık kanat forveti verir; bek merkezde oyun kurar. Guardiola'nın City'de popülerleştirdiği silah.",
            "Amatör uyarlama: en oyun-okuyan bekini seç. Top kaybında zaten merkezde olduğu için ilk savunma perdesini o kurar.",
        ],
    },
    {
        id: 'half-spaces',
        tag: 'Yarım-alan kullanımı',
        title: 'Half-Spaces',
        summary: 'Sahayı 5 dikey koridora böl; 2. ve 4. koridorları sömür.',
        icon: 'Layers', accent: 'purple',
        detail: [
            "Sahayı dikey 5 koridora böl. Kenarlar (1 ve 5) kanat; merkez (3) kalabalık. Asıl altın bölge 2. ve 4. koridorlar — 'yarım-alanlar'.",
            "Buradan hem kaleyi görürsün hem pas açına sahip olursun. Stoperler seni takip etmekte tereddüt eder (merkezi terk etmek istemezler).",
            "Amatör uyarlama: 10 numaranı ya da içe kat eden kanadını sürekli bu iki koridora sok. 'Çizgide değil, çizgiyle merkez arasında dur' talimatı ver.",
        ],
    },
];

interface StudioProps {
    onBack: () => void;
    onNavigate: (view: any) => void;
}

const Studio: React.FC<StudioProps> = ({ onBack, onNavigate }) => {
    // Açılış yönü bağlama göre: Taktik Öner / bildirim / takım planı gibi bir
    // bağlamla gelindiyse doğrudan tahtaya (STUDIO); bağlamsız (Dashboard
    // "TAKTİK STÜDYO" kartı) Gelişim & Taktik Merkezi'ne (SELECTION) düşülür.
    const [viewMode, setViewMode] = useState<'SELECTION' | 'STUDIO' | 'EDUCATION' | 'CURRENT'>(
        () => useAppStore.getState().studioContext ? 'STUDIO' : 'SELECTION'
    );
    // Unified Plans State
    const [plans, setPlans] = useState<TacticState[]>([{
        id: crypto.randomUUID(),
        name: 'Plan A',
        size: '7v7',
        formation: '2-3-1',
        slots: JSON.parse(JSON.stringify(FORMATIONS['7v7']['2-3-1'])),
        subs: [],
        captainId: null,
        notes: 'Taktiksel analiz',
        opponents: [],
        mentality: 'Balanced',
        tempo: 'Normal',
        identity: 'BALANCED'
    }]);
    const [activePlanIndex, setActivePlanIndex] = useState(0);
    
    // Farazi Tools
    const [tool, setTool] = useState<StudioTool>('move');
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    const [playMode, setPlayMode] = useState<PlayMode>('SYNC');
    const [showBall, setShowBall] = useState(false);

    // ⚡ Gelişmiş Animasyon Modülü durumu (lazy-load).
    // isAdvancedAnimLoaded: kullanıcı modülü indirdi mi?
    // advancedAnimApiRef: yüklenen modülün getAnimationProps fonksiyonu (saha
    // slot/rakip markörlerini hareket ettirmek için çekirdekte kullanılır).
    const [isAdvancedAnimLoaded, setIsAdvancedAnimLoaded] = useState(false);
    const [isLoadingAdvancedAnim, setIsLoadingAdvancedAnim] = useState(false);
    const advancedAnimApiRef = useRef<null | ((path: DrawingLine, isSimulating: boolean, playMode: PlayMode, seqInfo: { startTime: number, duration: number }, totalSeqDur: number) => any)>(null);

    // Modülü on-demand indirir; getAnimationProps API'sini ref'e bağlar.
    const loadAdvancedAnimation = async () => {
        if (isAdvancedAnimLoaded || isLoadingAdvancedAnim) return;
        setIsLoadingAdvancedAnim(true);
        try {
            const mod = await import('./studio/AdvancedAnimationModule');
            advancedAnimApiRef.current = mod.getAnimationProps;
            setIsAdvancedAnimLoaded(true);
        } catch (e) {
            console.error('Gelişmiş animasyon modülü yüklenemedi:', e);
            showToast('Gelişmiş animasyon modülü yüklenemedi.', 'error');
        } finally {
            setIsLoadingAdvancedAnim(false);
        }
    };
    const [selectedSeqBadge, setSelectedSeqBadge] = useState<string | null>(null);
    const [isCustomSeqInputOpen, setIsCustomSeqInputOpen] = useState(false);
    const [customSeqValue, setCustomSeqValue] = useState<string>('');
    const [currentLine, setCurrentLine] = useState<DrawingLine | null>(null);
    const [selectedSlotForArchetype, setSelectedSlotForArchetype] = useState<string | null>(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    
    // Custom Player Creation (Farazi)
    const [customPlayerName, setCustomPlayerName] = useState('');
    const [customPlayerRole, setCustomPlayerRole] = useState('-');

    // Modal selection tabs & groups state (matching CommunityView)
    const [modalTab, setModalTab] = useState<'FRIENDS' | 'TEAMS' | 'CUSTOM'>('FRIENDS');
    const [selectedGroup, setSelectedGroup] = useState('Tümü');
    const [groups, setGroups] = useState(['Favorilerim', 'Lise Tayfası', 'Üniversite', 'İş Arkadaşları', 'Tümü']);
    const [selectedTeamRosterId, setSelectedTeamRosterId] = useState<string | null>(null);

    // IQ Academy State
    const [academyState, setAcademyState] = useState<'MENU' | 'LESSON'>('MENU');
    const [lessonPhase, setLessonPhase] = useState<'ANIMATION' | 'QUIZ' | 'DRAG' | 'SUCCESS'>('ANIMATION');
    const [userIQ, setUserIQ] = useState(115);
    const [quizAnswerStatus, setQuizAnswerStatus] = useState<'IDLE' | 'CORRECT' | 'WRONG'>('IDLE');
    const [selectedQuizIdx, setSelectedQuizIdx] = useState<number | null>(null);
    const [dragSuccess, setDragSuccess] = useState(false);
    const [currentStageIndex, setCurrentStageIndex] = useState(0);
    const currentScenario = ACADEMYS[currentStageIndex];

    // GÜNCEL/Modern Trendler: hangi kartın açık (accordion) ve hangilerinin
    // yerel olarak kaydedildiği (oturum içi dürüst bookmark durumu).
    const [expandedTrend, setExpandedTrend] = useState<string | null>(null);
    const [savedTrends, setSavedTrends] = useState<Set<string>>(new Set());

    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
    const [isTeamConfirmed, setIsTeamConfirmed] = useState(false);

    const canvasRef = useRef<HTMLDivElement>(null);

    // Modals
    const [showTacticsModal, setShowTacticsModal] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
    const [saveTacticName, setSaveTacticName] = useState('');
    const [dbTactics, setDbTactics] = useState<TacticState[]>([]);

    // Global Store — arkadaşlar oyuncu-seçicide kullanılır
    const { friends } = useAppStore();
    const studioContext = useAppStore(s => s.studioContext);
    const setStudioContext = useAppStore(s => s.setStudioContext);

    // ── Küme 3 köprüsü: kanonik takımlar + GERÇEK kadrolar ──
    // store.myTeams (hayalet roster JSONB) ÖLDÜ; kaynak get_my_teams +
    // get_team_squad. Kadrolar takım seçilince tembel yüklenir.
    const [studioTeams, setStudioTeams] = useState<MyTeamRow[]>([]);
    const [squadsByTeam, setSquadsByTeam] = useState<Record<string, TeamSquadRow[]>>({});
    const squadsRef = useRef(squadsByTeam);
    squadsRef.current = squadsByTeam;

    useEffect(() => {
        if (!auth.currentUser) return;
        getMyTeams()
            .then(rows => setStudioTeams(rows.filter(r => !r.is_archived)))
            .catch(e => console.error('[Studio] takımlar yüklenemedi', e));
    }, []);

    const ensureSquad = async (teamId: string): Promise<TeamSquadRow[]> => {
        const cached = squadsRef.current[teamId];
        if (cached) return cached;
        const rows = await getTeamSquad(teamId);
        setSquadsByTeam(prev => ({ ...prev, [teamId]: rows }));
        return rows;
    };

    const squadRowToPlayer = (m: TeamSquadRow): Player => ({
        id: m.user_id,
        name: m.full_name,
        role: m.pos || 'CM',
        rating: m.fp || 70,
    });

    const populateSlotsWithSquad = (squad: TeamSquadRow[], currentSlots: Slot[]): Slot[] => {
        const newSlots = currentSlots.map(s => ({ ...s, player: undefined as Player | undefined }));
        const availablePlayers = squad.map(squadRowToPlayer);

        // GK önce eşleşir
        const gkSlotIndex = newSlots.findIndex(s => s.role === 'GK');
        if (gkSlotIndex !== -1) {
            const gkIndex = availablePlayers.findIndex(p => p.role === 'GK' || p.role === 'KALECİ');
            if (gkIndex !== -1) {
                newSlots[gkSlotIndex].player = availablePlayers[gkIndex];
                availablePlayers.splice(gkIndex, 1);
            }
        }
        newSlots.forEach((slot, idx) => {
            if (!slot.player && availablePlayers.length > 0) {
                let matchingIdx = availablePlayers.findIndex(p => p.role === slot.role);
                if (matchingIdx === -1) matchingIdx = 0;
                newSlots[idx].player = availablePlayers[matchingIdx];
                availablePlayers.splice(matchingIdx, 1);
            }
        });
        return newSlots;
    };

    // DB satırı → TacticState (fetch + derin bağlantı hidrasyonu ortak)
    const parseDbTactic = (d: any): TacticState => ({
        id: d.id,
        name: d.name,
        teamName: d.teamName,
        teamId: d.teamId ?? null,
        size: d.size,
        formation: d.formation,
        slots: JSON.parse(d.slots || '[]'),
        subs: JSON.parse(d.subs || '[]'),
        captainId: d.captainId || null,
        notes: d.notes || '',
        opponents: JSON.parse(d.opponents || '[]'),
        mentality: d.mentality || 'Balanced',
        tempo: d.tempo || 'Normal',
        identity: d.identity || 'BALANCED',
        drawings: JSON.parse(d.drawings || '[]'),
        status: d.status || undefined,
        proposedBy: d.proposedBy ?? null,
    });

    // studioContext tüketimi (M80): Takım Detayı'ndan gelen takım/taktik
    // bağlamı — activeStudioTeam makinesinin halefi.
    useEffect(() => {
        const ctx = studioContext;
        if (!ctx) return;
        setStudioContext(null); // tek kullanımlık — tüket
        void (async () => {
            try {
                if (ctx.tacticId) {
                    const row = await getTacticById(ctx.tacticId);
                    if (!row) { showToast('Taktik bulunamadı ya da erişimin yok.', 'error'); return; }
                    const hydrated = parseDbTactic(row);
                    setPlans(prev => {
                        const idx = prev.findIndex(p => p.id === hydrated.id);
                        if (idx >= 0) {
                            const next = [...prev]; next[idx] = hydrated;
                            setActivePlanIndex(idx);
                            return next;
                        }
                        setActivePlanIndex(prev.length);
                        return [...prev, hydrated];
                    });
                    if (hydrated.teamId) {
                        setSelectedTeamId(hydrated.teamId);
                        setIsTeamConfirmed(true);
                        void ensureSquad(hydrated.teamId);
                    }
                    setViewMode('STUDIO');
                } else if (ctx.teamId) {
                    setSelectedTeamId(ctx.teamId);
                    const [squad, teams] = await Promise.all([ensureSquad(ctx.teamId), getMyTeams()]);
                    const teamRow = teams.find(t => t.team_id === ctx.teamId);
                    setStudioTeams(teams.filter(r => !r.is_archived));
                    setPlans(prev => {
                        const idx = Math.min(activePlanIndex, prev.length - 1);
                        return prev.map((p, i) => i === idx
                            ? { ...p, slots: populateSlotsWithSquad(squad, p.slots), teamName: teamRow?.name, teamId: ctx.teamId }
                            : p);
                    });
                    setIsTeamConfirmed(true);
                    setViewMode('STUDIO');
                }
            } catch (e) {
                console.error('[Studio] bağlam yüklenemedi', e);
                showToast('Stüdyo bağlamı yüklenemedi.', 'error');
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studioContext]);

    useEffect(() => {
        if (!auth.currentUser) return;

        const fetchTactics = async () => {
            const { data, error } = await supabase
                .from('tactics')
                .select('*')
                .eq('userId', auth.currentUser.uid);

            if (error) {
                console.error("Error fetching tactics:", error);
                return;
            }

            setDbTactics((data || []).map(parseDbTactic));
        };
        fetchTactics();

        const channel = supabase.channel(`tactics_${auth.currentUser.uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tactics', filter: `userId=eq.${auth.currentUser.uid}` }, () => {
                fetchTactics();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);



    // Common State
    const [editingPlanIndex, setEditingPlanIndex] = useState<number | null>(null);
    const [editingPlanName, setEditingPlanName] = useState('');
    const [showPlayerSelect, setShowPlayerSelect] = useState<{ type: 'slot', slotId: string } | { type: 'sub' } | { type: 'any' } | null>(null);
    const [draggedItem, setDraggedItem] = useState<{ type: 'slot' | 'opponent', id: string, offsetX: number, offsetY: number } | null>(null);
    
    // Instruction Modal State
    const [instructionModal, setInstructionModal] = useState<{ type: 'slot' | 'opponent', id: string } | null>(null);

    const activeTactic = plans[activePlanIndex] || plans[0];
    const setActiveTactic = (newTactic: TacticState) => {
        const index = Math.min(activePlanIndex, plans.length - 1);
        const newPlans = [...plans];
        newPlans[index] = newTactic;
        setPlans(newPlans);
    };

    const drawings = activeTactic.drawings || [];
    const setDrawings = (newDrawings: DrawingLine[] | ((prev: DrawingLine[]) => DrawingLine[])) => {
        const derivedDrawings = typeof newDrawings === 'function' ? newDrawings(drawings) : newDrawings;
        setActiveTactic({ ...activeTactic, drawings: derivedDrawings });
    };

    // Sekans haritası (hafif hesap — çekirdekte kalır, gelişmiş modüle de geçer)
    const { seqMap, totalSeqDuration } = computeSeqMap(drawings);

    // --- Common Handlers ---
    const preservePlayersAndSubs = (newSlots: Slot[], currentSubs: Player[]) => {
        const currentPlayers = activeTactic.slots.filter(s => s.player).map(s => s.player);
        let playerIndex = 0;
        newSlots.forEach((s: any) => {
            if (playerIndex < currentPlayers.length) {
                let selectedPlayer = null;
                if (s.role === 'GK') {
                    const gkIndex = currentPlayers.findIndex((p: any, idx: number) => p.role === 'GK' && idx >= playerIndex);
                    if (gkIndex !== -1) {
                         selectedPlayer = currentPlayers[gkIndex];
                         currentPlayers[gkIndex] = currentPlayers[playerIndex];
                         currentPlayers[playerIndex] = selectedPlayer;
                    }
                }
                if (!selectedPlayer) {
                    selectedPlayer = currentPlayers[playerIndex];
                }
                s.player = selectedPlayer;
                playerIndex++;
            }
        });

        const leftovers = currentPlayers.slice(playerIndex);
        const newSubs = [...currentSubs];
        leftovers.forEach(p => {
            if (p && !newSubs.some(sub => sub.id === p.id)) {
                newSubs.push(p);
            }
        });
        
        return { newSlots, newSubs };
    };

    const handleSizeChange = (size: SquadSize) => {
        const defaultFormation = Object.keys(FORMATIONS[size])[0] as FormationType;
        let baseSlots = JSON.parse(JSON.stringify(FORMATIONS[size][defaultFormation]));
        const { newSlots, newSubs } = preservePlayersAndSubs(baseSlots, activeTactic.subs);
        let captainId = activeTactic.captainId;
        if (captainId && !newSlots.some((s:any) => s.player?.id === captainId)) captainId = null;
        setActiveTactic({ ...activeTactic, size, formation: defaultFormation, slots: newSlots, subs: newSubs, captainId, drawings: [] });
    };

    const handleIdentityChange = (identity: GameIdentity) => {
        const baseSlots = JSON.parse(JSON.stringify(FORMATIONS[activeTactic.size][activeTactic.formation]));
        const newSlots = baseSlots.map((slot: Slot) => {
            // Keep existing player and archetype
            const existingSlot = activeTactic.slots.find(s => s.id === slot.id);
            if (existingSlot) {
                slot.player = existingSlot.player;
                slot.archetype = existingSlot.archetype;
            }
            
            // Apply identity offset
            if (slot.role !== 'GK') {
                if (identity === 'HIGH_PRESS') {
                    // Push everyone up
                    slot.y = Math.max(10, slot.y - 15);
                } else if (identity === 'PARK_BUS') {
                    // Pull everyone back
                    slot.y = Math.min(85, slot.y + 15);
                } else if (identity === 'COUNTER_ATTACK') {
                    // FWD stays up, others drop back
                    if (slot.role === 'FWD') {
                        slot.y = 15;
                    } else {
                        slot.y = Math.min(85, slot.y + 10);
                    }
                }
            }
            return slot;
        });
        setActiveTactic({ ...activeTactic, identity, slots: newSlots });
    };

    const handleFormationChange = (f: FormationType) => {
        let baseSlots = JSON.parse(JSON.stringify(FORMATIONS[activeTactic.size][f]));
        const { newSlots, newSubs } = preservePlayersAndSubs(baseSlots, activeTactic.subs);
        let captainId = activeTactic.captainId;
        if (captainId && !newSlots.some((s:any) => s.player?.id === captainId)) captainId = null;
        setActiveTactic({ ...activeTactic, formation: f, slots: newSlots, subs: newSubs, captainId, drawings: [] });
    };

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSelectPlayer = (player: Player) => {
        if (!showPlayerSelect) return;

        const isAlreadyInSlots = activeTactic.slots.some(s => s.player?.id === player.id);
        const isAlreadyInSubs = activeTactic.subs.some(p => p.id === player.id);

        if (isAlreadyInSlots || isAlreadyInSubs) {
            showToast("Bu oyuncu zaten kadroda!", 'error');
            return;
        }

        if (showPlayerSelect.type === 'slot') {
            const newSlots = activeTactic.slots.map(s => 
                s.id === showPlayerSelect.slotId ? { ...s, player } : s
            );
            setActiveTactic({ ...activeTactic, slots: newSlots });
            setShowPlayerSelect(null);
        } else if (showPlayerSelect.type === 'sub') {
            setActiveTactic({ ...activeTactic, subs: [...activeTactic.subs, player] });
            setShowPlayerSelect(null);
        } else if (showPlayerSelect.type === 'any') {
            let targetSlotIndex = activeTactic.slots.findIndex(s => !s.player && s.role === player.role);
            if (targetSlotIndex === -1) {
                targetSlotIndex = activeTactic.slots.findIndex(s => !s.player);
            }
            if (targetSlotIndex !== -1) {
                const newSlots = [...activeTactic.slots];
                newSlots[targetSlotIndex] = { ...newSlots[targetSlotIndex], player };
                setActiveTactic({ ...activeTactic, slots: newSlots });
                showToast(`${player.name} sahaya eklendi!`, 'success');
            } else {
                setActiveTactic({ ...activeTactic, subs: [...activeTactic.subs, player] });
                showToast(`${player.name} yedeklere eklendi!`, 'success');
            }
        }
    };

    const handleRemovePlayer = (slotId: string) => {
        let newCaptainId = activeTactic.captainId;
        const newSlots = activeTactic.slots.map(s => {
            if (s.id === slotId) {
                if (activeTactic.captainId === s.player?.id) {
                    newCaptainId = null;
                }
                return { ...s, player: undefined, instruction: undefined };
            }
            return s;
        });
        setActiveTactic({ ...activeTactic, slots: newSlots, captainId: newCaptainId });
    };

    const handleRemoveSub = (playerId: string) => {
        setActiveTactic({ ...activeTactic, subs: activeTactic.subs.filter(p => p.id !== playerId) });
    };

    const handleSetCaptain = (playerId: string) => {
        setActiveTactic({ ...activeTactic, captainId: playerId });
    };

    const handleSetInstruction = (type: 'slot' | 'opponent', id: string, instruction: string) => {
        if (type === 'slot') {
            const newSlots = activeTactic.slots.map(s => 
                s.id === id ? { ...s, instruction } : s
            );
            setActiveTactic({ ...activeTactic, slots: newSlots });
        } else {
            const newOpponents = activeTactic.opponents.map(o => 
                o.id === id ? { ...o, instruction } : o
            );
            setActiveTactic({ ...activeTactic, opponents: newOpponents });
        }
        setInstructionModal(null);
    };

    const handleReorderPlans = (newPlans: TacticState[]) => {
        const currentActivePlan = plans[activePlanIndex];
        const newActiveIndex = newPlans.findIndex(p => p.id === currentActivePlan?.id);
        setPlans(newPlans);
        if (newActiveIndex !== -1) setActivePlanIndex(newActiveIndex);
    };

    const handlePlanClick = (index: number) => {
        const isActive = activePlanIndex === index;
        if (isActive) {
            const colors: ('DEFAULT' | 'RED' | 'NAVY' | 'GREEN')[] = ['DEFAULT', 'RED', 'NAVY', 'GREEN'];
            const newPlans = [...plans];
            const currentPlan = newPlans[index];
            const currentColor = currentPlan.groupColor || 'DEFAULT';
            const nextColor = colors[(colors.indexOf(currentColor) + 1) % colors.length];
            newPlans[index] = { ...currentPlan, groupColor: nextColor };
            setPlans(newPlans);
        } else {
            setActivePlanIndex(index);
        }
    };

    const handleRenamePlan = (index: number) => {
        setEditingPlanIndex(index);
        setEditingPlanName(plans[index].name);
    };

    const savePlanName = () => {
        if (editingPlanIndex !== null && editingPlanName.trim() !== '') {
            const newPlans = [...plans];
            newPlans[editingPlanIndex] = { ...newPlans[editingPlanIndex], name: editingPlanName.trim() };
            setPlans(newPlans);
        }
        setEditingPlanIndex(null);
    };

    const handleDeletePlan = (index: number) => {
        if (confirm('Bu planı silmek istediğinize emin misiniz?')) {
            const newPlans = plans.filter((_, i) => i !== index);
            setPlans(newPlans);
            if (activePlanIndex === index) {
                setActivePlanIndex(Math.max(0, index - 1));
            } else if (activePlanIndex > index) {
                setActivePlanIndex(activePlanIndex - 1);
            }
        }
    };

    const handleReset = () => {
        setPlans([{
            id: crypto.randomUUID(),
            name: 'Plan A',
            size: '7v7',
            formation: '2-3-1',
            slots: JSON.parse(JSON.stringify(FORMATIONS['7v7']['2-3-1'])),
            subs: [],
            captainId: null,
            notes: 'Taktiksel analiz',
            opponents: [],
            mentality: 'Balanced',
            tempo: 'Normal',
            identity: 'BALANCED'
        }]);
        setActivePlanIndex(0);
        setViewMode('STUDIO');
        setShowResetConfirmModal(false);
    };

    const handleNewTactic = () => {
        let baseSlots = JSON.parse(JSON.stringify(FORMATIONS['7v7']['2-3-1']));
        const { newSlots, newSubs } = preservePlayersAndSubs(baseSlots, activeTactic.subs || []);

        const newPlan: TacticState = {
            id: crypto.randomUUID(),
            name: `Yeni Taktik ${plans.length + 1}`,
            size: '7v7',
            formation: '2-3-1',
            slots: newSlots,
            subs: newSubs,
            captainId: activeTactic.captainId,
            notes: '',
            opponents: [],
            mentality: activeTactic.mentality,
            tempo: activeTactic.tempo,
            identity: activeTactic.identity
        };
        
        setPlans([...plans, newPlan]);
        setActivePlanIndex(plans.length);
        showToast("Yeni taktik alanı oluşturuldu!");
    };

    // Kayıt TEK KAPIDAN: save_team_tactic RPC. Status SUNUCUDA belirlenir
    // (yönetici → APPROVED, üye → PENDING_APPROVAL + yöneticilere bildirim,
    // takımsız → kişisel kütüphane). İstemci status yazımı ÖLDÜ (M85).
    const handleSaveTactic = async () => {
        if (!saveTacticName.trim()) {
            showToast("Taktik ismi boş olamaz.", 'error');
            return;
        }
        if (!auth.currentUser) {
            showToast("Taktiği kaydetmek için giriş yapmalısın.", 'error');
            return;
        }

        try {
            const existingId = activeTactic.id && dbTactics.find(t => t.id === activeTactic.id)
                ? activeTactic.id : null;
            const res = await saveTeamTactic(selectedTeamId ?? null, existingId, {
                name: saveTacticName.trim(),
                size: activeTactic.size,
                formation: activeTactic.formation,
                slots: activeTactic.slots,
                subs: activeTactic.subs,
                opponents: activeTactic.opponents,
                drawings: activeTactic.drawings || [],
                captainId: activeTactic.captainId,
                notes: activeTactic.notes,
                mentality: activeTactic.mentality,
                tempo: activeTactic.tempo,
                identity: activeTactic.identity,
            });

            const teamRow = studioTeams.find(t => t.team_id === selectedTeamId);
            setActiveTactic({
                ...activeTactic,
                id: res.tacticId,
                name: saveTacticName.trim(),
                teamName: teamRow?.name,
                teamId: selectedTeamId || null,
                status: res.status as TacticState['status'],
                proposedBy: res.status === 'PENDING_APPROVAL' ? auth.currentUser.uid : null,
            });
            showToast(res.status === 'PENDING_APPROVAL'
                ? "Taktik önerin takım yöneticilerine gönderildi!"
                : "Taktik kaydedildi!");
            setShowSaveModal(false);
        } catch (error) {
            console.error("Error saving tactic:", error);
            showToast((error as Error)?.message || "Taktik kaydedilirken bir hata oluştu.", 'error');
        }
    };

    // Stüdyo-içi öneri karar akışı: bekleyen takım taktiği + yönetici (M87)
    const myRoleForActiveTeam = studioTeams.find(t => t.team_id === (activeTactic.teamId || selectedTeamId))?.my_role;
    const canDecideProposal = !!(
        activeTactic.status === 'PENDING_APPROVAL'
        && activeTactic.teamId
        && (myRoleForActiveTeam === 'CAPTAIN' || myRoleForActiveTeam === 'ADMIN')
        && activeTactic.proposedBy
        && activeTactic.proposedBy !== auth.currentUser?.uid
    );
    const [decidingProposal, setDecidingProposal] = useState(false);

    const decideProposal = async (approve: boolean) => {
        if (!activeTactic.id || decidingProposal) return;
        setDecidingProposal(true);
        try {
            if (approve) {
                await approveTacticRpc(activeTactic.id);
                setActiveTactic({ ...activeTactic, status: 'APPROVED' });
                showToast("Taktik onaylandı — oyun defterine eklendi!");
            } else {
                await rejectTacticRpc(activeTactic.id);
                setActiveTactic({ ...activeTactic, status: 'REJECTED' });
                showToast("Öneri reddedildi; yazarın kişisel kütüphanesine kopyalandı.");
            }
        } catch (e) {
            showToast((e as Error)?.message || 'İşlem tamamlanamadı.', 'error');
        } finally {
            setDecidingProposal(false);
        }
    };

    // --- Farazi Mode Handlers ---
    const handleCreateCustomPlayer = () => {
        if (!customPlayerName.trim() || !showPlayerSelect) return;

        const newPlayer: Player = {
            id: `custom_${Date.now()}`,
            name: customPlayerName,
            role: customPlayerRole,
            rating: 99,
            isCustom: true
        };

        handleSelectPlayer(newPlayer);
        setCustomPlayerName('');
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!canvasRef.current) return;
        
        const rect = canvasRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        if (tool.startsWith('draw')) {
            setIsDrawing(true);
            
            // Find nearest slot or opponent (within 5% radius)
            let attachedTo: string | undefined;
            const threshold = 5;
            let minDistance = Infinity;

            activeTactic.slots.forEach(slot => {
                const dist = Math.sqrt(Math.pow(slot.x - x, 2) + Math.pow(slot.y - y, 2));
                if (dist < threshold && dist < minDistance) {
                    minDistance = dist;
                    attachedTo = slot.id;
                }
            });

            activeTactic.opponents.forEach(opp => {
                const dist = Math.sqrt(Math.pow(opp.x - x, 2) + Math.pow(opp.y - y, 2));
                if (dist < threshold && dist < minDistance) {
                    minDistance = dist;
                    attachedTo = opp.id;
                }
            });

            // Check if there is already a line attached to this item of the same type.
            // A player can have a run and a pass simultaneously.
            if (attachedTo) {
                const lineType = tool === 'draw_pass' ? 'arrow' : 'line';
                setDrawings(prev => prev.filter(d => d.attachedTo !== attachedTo || d.type !== lineType));
            }

            const maxSeq = drawings.reduce((max, d) => Math.max(max, d.seqStep), 0);
            setCurrentLine({
                id: `l${Date.now()}`,
                points: [{ x, y }],
                color: attachedTo ? (activeTactic.slots.find(s => s.id === attachedTo) ? '#39FF14' : '#ef4444') : '#39FF14',
                type: tool === 'draw_pass' ? 'arrow' : 'line',
                attachedTo,
                seqStep: maxSeq + 1
            });
        } else if (tool === 'opponent') {
            const newOpponent: Slot = {
                id: `opp_${Date.now()}`,
                x,
                y,
                role: 'OPP',
                player: {
                    id: `opp_p_${Date.now()}`,
                    name: `Rakip ${activeTactic.opponents.length + 1}`,
                    role: 'OPP',
                    rating: 0,
                    isOpponent: true
                }
            };
            setActiveTactic({ ...activeTactic, opponents: [...activeTactic.opponents, newOpponent] });
            if (navigator.vibrate) navigator.vibrate(10);
        }
    };

    const rafRef = useRef<number | null>(null);

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!canvasRef.current) return;
        
        const rect = canvasRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        if (isDrawing && currentLine) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                setCurrentLine(prev => {
                    if (!prev) return null;
                    const lastPoint = prev.points[prev.points.length - 1];
                    if (prev.points.length > 0) {
                        const dist = Math.hypot(x - lastPoint.x, y - lastPoint.y);
                        // Add point ONLY if it moved at least somewhat (2% distance)
                        if (dist < 2.0) return prev;
                    }
                    return {
                        ...prev,
                        points: [...prev.points, { x, y }]
                    };
                });
            });
        } else if (draggedItem && tool === 'move') {
            const clampedX = Math.max(0, Math.min(100, x - draggedItem.offsetX));
            const clampedY = Math.max(0, Math.min(100, y - draggedItem.offsetY));

            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                if (draggedItem.type === 'slot') {
                    setActiveTactic({
                        ...activeTactic,
                        slots: activeTactic.slots.map(s => 
                            s.id === draggedItem.id ? { ...s, x: clampedX, y: clampedY } : s
                        )
                    });
                } else if (draggedItem.type === 'opponent') {
                    setActiveTactic({
                        ...activeTactic,
                        opponents: activeTactic.opponents.map(o => 
                            o.id === draggedItem.id ? { ...o, x: clampedX, y: clampedY } : o
                        )
                    });
                }
            });
        }
    };

    const handlePointerUp = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        
        if (isDrawing && currentLine) {
            const finalLine = { ...currentLine } as DrawingLine;
            setDrawings([...drawings, finalLine]);
            setIsDrawing(false);
            setCurrentLine(null);
        }
        setDraggedItem(null);
    };

    const handleDragStart = (type: 'slot' | 'opponent', id: string, e: React.PointerEvent) => {
        if (tool !== 'move' || !canvasRef.current) return;
        e.stopPropagation();
        e.currentTarget.releasePointerCapture(e.pointerId);

        let currentX = 0;
        let currentY = 0;
        if (type === 'slot') {
            const slot = activeTactic.slots.find(s => s.id === id);
            if (slot) { currentX = slot.x; currentY = slot.y; }
        } else {
            const opp = activeTactic.opponents.find(o => o.id === id);
            if (opp) { currentX = opp.x; currentY = opp.y; }
        }

        const rect = canvasRef.current.getBoundingClientRect();
        const pointerX = ((e.clientX - rect.left) / rect.width) * 100;
        const pointerY = ((e.clientY - rect.top) / rect.height) * 100;

        setDraggedItem({ type, id, offsetX: pointerX - currentX, offsetY: pointerY - currentY });
        if (navigator.vibrate) navigator.vibrate(10);
    };

    const handleRemoveOpponent = (id: string) => {
        setActiveTactic({ ...activeTactic, opponents: activeTactic.opponents.filter(o => o.id !== id) });
    };



    const isSquadComplete = activeTactic.slots.every(s => !!s.player);
    const hasGK = activeTactic.slots.some(s => s.role === 'GK' && !!s.player);
    const canSave = isSquadComplete && hasGK;

    // Get all players on the pitch (own team + opponents)
    const allPlayersOnPitch = [
        ...activeTactic.slots.filter(s => s.player).map(s => ({ ...s, type: 'slot' as const })),
        ...activeTactic.opponents.map(o => ({ ...o, type: 'opponent' as const }))
    ];

    return (
        <div className="min-h-screen flex flex-col font-sans selection:bg-[#39FF14] selection:text-black pb-10">
            <AnimatePresence mode="wait">
                {viewMode === 'SELECTION' ? (
                    <motion.div 
                        key="selection"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.05 }}
                        className="flex-1 flex flex-col p-6"
                    >
                        {/* Selection Header */}
                        <div className="flex items-center gap-4 mb-12">
                            <button id="studio-back-button" onClick={onBack} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all">
                                <ChevronLeft size={24} />
                            </button>
                            <div>
                                <h1 className="text-2xl font-black text-white tracking-widest uppercase italic">MERKEZ</h1>
                                <p className="text-xs text-[#39FF14] font-bold uppercase tracking-widest">Gelişim & Taktik</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {/* Option 1: Eğitim — IQ Academy (10 aşamalı hücum masterclass) */}
                            <button
                                onClick={() => { setAcademyState('MENU'); setViewMode('EDUCATION'); }}
                                className="group relative h-40 bg-gradient-to-br from-blue-600/10 to-indigo-600/10 rounded-[32px] border border-blue-500/20 overflow-hidden text-left p-6 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full" />
                                <div className="relative z-10 h-full flex flex-col justify-between">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/30">
                                        <Dumbbell size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">EĞİTİM</h3>
                                        <p className="text-xs text-blue-300/60 font-medium">Taktiksel zekanı geliştir, yeni metodlar öğren.</p>
                                    </div>
                                </div>
                                <Dumbbell size={120} className="absolute -right-8 -bottom-8 text-white/5 -rotate-12 group-hover:text-blue-500/10 transition-all" />
                            </button>

                            {/* Option 2: Güncel — Modern Trendler */}
                            <button
                                onClick={() => setViewMode('CURRENT')}
                                className="group relative h-40 bg-gradient-to-br from-amber-600/10 to-orange-600/10 rounded-[32px] border border-amber-500/20 overflow-hidden text-left p-6 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full" />
                                <div className="relative z-10 h-full flex flex-col justify-between">
                                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30">
                                        <Zap size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">GÜNCEL</h3>
                                        <p className="text-xs text-amber-300/60 font-medium">Dünya futbolundan en yeni dizilişler ve trendler.</p>
                                    </div>
                                </div>
                                <Zap size={120} className="absolute -right-8 -bottom-8 text-white/5 -rotate-12 group-hover:text-amber-500/10 transition-all" />
                            </button>

                            {/* Option 3: Studio (Existing) */}
                            <button 
                                onClick={() => setViewMode('STUDIO')}
                                className="group relative h-40 bg-gradient-to-br from-[#39FF14]/10 to-emerald-600/10 rounded-[32px] border border-[#39FF14]/20 overflow-hidden text-left p-6 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#39FF14]/10 blur-3xl rounded-full" />
                                <div className="relative z-10 h-full flex flex-col justify-between">
                                    <div className="w-12 h-12 rounded-2xl bg-[#39FF14]/20 flex items-center justify-center text-[#39FF14] border border-[#39FF14]/30">
                                        <Layout size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">STÜDYO</h3>
                                        <p className="text-xs text-[#39FF14]/60 font-medium">Kendi dizilişini oluştur, takımını yönet.</p>
                                    </div>
                                </div>
                                <Layout size={120} className="absolute -right-8 -bottom-8 text-white/5 -rotate-12 group-hover:text-[#39FF14]/10 transition-all" />
                            </button>
                        </div>
                    </motion.div>
                ) : viewMode === 'EDUCATION' ? (
                    <motion.div 
                        key="education"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex flex-col flex-1 relative"
                    >
                        {academyState === 'MENU' ? (
                            <div className="flex-1 flex flex-col pt-2 max-w-lg mx-auto w-full">
                                {/* Top Header: Profile & Back */}
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <button onClick={() => setViewMode('SELECTION')} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-all border border-white/10 backdrop-blur-md shrink-0">
                                            <ChevronLeft size={24} />
                                        </button>
                                        <div>
                                            <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter leading-none mb-1">IQ ACADEMY</h2>
                                            <p className="text-[10px] text-[#39FF14] font-bold uppercase tracking-[0.2em] leading-none">Futbol Zekanı Geliştir</p>
                                        </div>
                                    </div>
                                </div>

                                {/* User Level Progress */}
                                <div className="bg-[#161B22] border border-white/10 rounded-3xl p-6 mb-8 shadow-2xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 group-hover:bg-blue-500/20 transition-all duration-700"></div>
                                    <div className="flex justify-between items-end mb-4 relative z-10">
                                        <div>
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Mevcut Seviye</span>
                                            <div className="flex items-center gap-2.5">
                                                <Shield className="text-blue-400" size={24} />
                                                <h3 className="text-xl font-black text-white uppercase tracking-wider">Yarı Profesyonel</h3>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-4xl font-black text-white leading-none">{userIQ} <span className="text-sm text-blue-400 ml-1">IQ</span></div>
                                        </div>
                                    </div>
                                    {/* Progress Bar */}
                                    <div className="w-full bg-black/50 h-3 rounded-full overflow-hidden border border-white/5 relative z-10 mb-2">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(userIQ / 2000) * 100}%` }}
                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                            className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-[#39FF14] relative"
                                        >
                                            <div className="absolute top-0 bottom-0 right-0 w-4 bg-white/50 blur-sm"></div>
                                        </motion.div>
                                    </div>
                                    <div className="flex justify-between mt-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest relative z-10">
                                        <span>Başlangıç</span>
                                        <span>Pro Seviye (2000 IQ)</span>
                                    </div>
                                </div>

                                {/* IQ Academy Content */}
                                <div className="space-y-6 flex-1 overflow-y-auto pb-10 hide-scrollbar">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-black text-white uppercase tracking-widest">Önerilen Eğitim</h4>
                                        <span className="text-[9px] text-[#39FF14] font-bold uppercase tracking-widest bg-[#39FF14]/10 px-2 py-1 rounded-md">Yeni Eklendi</span>
                                    </div>

                                    {/* Featured: The "Next Move" Challenge */}
                                    <motion.div 
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="bg-[#0A0E14] rounded-[32px] border border-blue-500/30 p-6 relative overflow-hidden group shadow-[0_20px_40px_rgba(0,0,0,0.5)] cursor-pointer"
                                        onClick={() => {
                                            setAcademyState('LESSON');
                                            setLessonPhase('ANIMATION');
                                        }}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-transparent to-indigo-900/40 z-0"></div>
                                        
                                        {/* Animated Grid Background */}
                                        <div className="absolute inset-0 opacity-[0.03] z-0" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                                        <div className="absolute -top-10 -right-10 opacity-20 transform group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 ease-out z-0">
                                            <Brain size={160} className="text-blue-400" />
                                        </div>
                                        
                                        <div className="relative z-10">
                                            <div className="flex justify-between items-center mb-6">
                                                <div className="flex items-center gap-2">
                                                    <span className="px-3 py-1 bg-blue-500 text-white rounded-lg text-[9px] font-black uppercase tracking-[0.2em] shadow-[0_0_15px_rgba(59,130,246,0.5)]">Modül 01</span>
                                                    <span className="px-3 py-1 bg-white/10 text-gray-300 rounded-lg text-[9px] font-bold uppercase tracking-[0.2em] backdrop-blur-md border border-white/10">10 Aşamalı Eğitim</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1 rounded-full border border-white/10">
                                                    <Star size={10} className="text-yellow-400" />
                                                    <span className="text-[10px] font-bold text-yellow-400">MAX +100 IQ</span>
                                                </div>
                                            </div>
                                            <h3 className="text-3xl font-black text-white italic uppercase mb-3 leading-[1.1] tracking-tighter">Hücum <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-[#39FF14]">Masterclass</span></h3>
                                            <p className="text-xs text-gray-400 mb-8 font-medium leading-relaxed max-w-[85%]">
                                                Modern futbolda hücumu kilitlemek isteyen kapanan savunmaları açmanın en etkili yolları. 10 farklı taktiksel senaryo seni bekliyor.
                                            </p>
                                            
                                            <button 
                                                className="w-full py-4 bg-white text-black font-black rounded-2xl text-xs tracking-[0.2em] uppercase transition-all shadow-[0_10px_30px_rgba(255,255,255,0.2)] flex items-center justify-center gap-3 overflow-hidden relative group/btn"
                                            >
                                                <div className="absolute inset-0 bg-[#39FF14] transform translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300 ease-out z-0"></div>
                                                <span className="relative z-10 group-hover/btn:text-black transition-colors">Simülasyona Gir</span>
                                                <ChevronLeft className="rotate-180 relative z-10" size={16} />
                                            </button>
                                        </div>
                                    </motion.div>

                                    {/* Intelligence Skill Tree */}
                                    <div>
                                        <h4 className="text-xs font-black text-white uppercase tracking-widest mb-4 mt-8 flex items-center gap-2"><Layers size={14} className="text-blue-500" /> Yetenek Ağacı</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div 
                                                onClick={() => {
                                                    if (userIQ >= 150) {
                                                        showToast("Scanning modülü projenin bir sonraki aşamasında aktif olacak!", "success");
                                                    } else {
                                                        showToast("Önce 150 IQ'ya ulaşmalısın!", "error");
                                                    }
                                                }}
                                                className={`bg-[#161B22] rounded-[24px] p-5 border border-white/5 relative overflow-hidden group transition-all ${userIQ < 150 ? 'cursor-not-allowed' : 'cursor-pointer hover:border-orange-500/30'}`}
                                            >
                                                {userIQ < 150 && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-[#050812]/80 backdrop-blur-sm z-10 transition-all opacity-100">
                                                        <div className="flex flex-col items-center gap-2">
                                                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                                            </div>
                                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">150 IQ GEREKİR</span>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-400 mb-4 border border-orange-500/20">
                                                    <Eye size={24} />
                                                </div>
                                                <h4 className="text-sm font-black text-white uppercase italic mb-1 tracking-wider">Scanning</h4>
                                                <p className="text-[10px] text-gray-500 font-medium leading-tight">Çevre kontrolü ve önseziler.</p>
                                            </div>
                                            
                                            <div 
                                                onClick={() => {
                                                    if (userIQ >= 200) {
                                                        showToast("Off-the-ball modülü projenin bir sonraki aşamasında aktif olacak!", "success");
                                                    } else {
                                                        showToast("Önce 200 IQ'ya ulaşmalısın!", "error");
                                                    }
                                                }}
                                                className={`bg-[#161B22] rounded-[24px] p-5 border border-white/5 relative overflow-hidden group transition-all ${userIQ < 200 ? 'cursor-not-allowed' : 'cursor-pointer hover:border-purple-500/30'}`}
                                            >
                                                {userIQ < 200 && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-[#050812]/80 backdrop-blur-sm z-10 transition-all opacity-100">
                                                        <div className="flex flex-col items-center gap-2">
                                                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                                            </div>
                                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">200 IQ GEREKİR</span>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 mb-4 border border-purple-500/20">
                                                    <Activity size={24} />
                                                </div>
                                                <h4 className="text-sm font-black text-white uppercase italic mb-1 tracking-wider">Off-the-ball</h4>
                                                <p className="text-[10px] text-gray-500 font-medium leading-tight">Topsuz alan koşuları ve sahte 9.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* THE INTERACTIVE LESSON MODULE */
                            <div className="absolute inset-0 bg-[#050812] z-50 flex flex-col p-6 pt-10 overflow-y-auto overflow-x-hidden">
                                {/* Lesson Header */}
                                <div className="flex items-center justify-between mb-6 pt-2 shrink-0">
                                    <button 
                                        onClick={() => {
                                            setAcademyState('MENU');
                                            setCurrentStageIndex(0);
                                            setLessonPhase('ANIMATION');
                                        }} 
                                        className="w-12 h-12 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white transition-all border border-white/10 shadow-lg shrink-0"
                                    >
                                        <X size={24} />
                                    </button>
                                    <div className="flex flex-col items-center">
                                        <span className="text-xs font-black text-gray-400 tracking-widest uppercase mb-2">Aşama {currentStageIndex + 1} / 10</span>
                                        <div className="flex gap-1.5">
                                            {ACADEMYS.map((_, i) => (
                                                <div key={i} className={`h-1 w-5 rounded-full ${i < currentStageIndex ? 'bg-[#39FF14]' : i === currentStageIndex ? 'bg-blue-500 animate-[pulse_1.5s_ease-in-out_infinite]' : 'bg-white/10'}`} />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="w-12 h-12 flex items-center justify-center bg-blue-500/10 rounded-full border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.2)] shrink-0">
                                        <Brain size={24} className="text-blue-500" />
                                    </div>
                                </div>

                                {/* Lesson Content Wrapper */}
                                <AnimatePresence mode="wait">
                                    {lessonPhase === 'ANIMATION' && (
                                        <motion.div 
                                            key="phase1"
                                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -50 }}
                                            className="flex-1 flex flex-col h-full"
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                                                <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter leading-none">1. GÖZLEM</h3>
                                            </div>
                                            <p className="text-sm font-medium text-gray-400 mb-8 leading-relaxed max-w-[90%]">{currentScenario.d}</p>
                                            
                                            {/* Animated Pitch Scene */}
                                            <div className="relative w-full aspect-[4/3] bg-[#0B2815] rounded-[32px] border-4 border-[#161B22] overflow-hidden mb-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex-shrink-0">
                                                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 10%, rgba(0,0,0,0.5) 10%, rgba(0,0,0,0.5) 20%)' }}></div>
                                                
                                                {/* Pitch Lines - Final Third */}
                                                <div className="absolute top-[-5%] left-[20%] right-[20%] h-[35%] border-b-2 border-x-2 border-white/30"></div> 
                                                <div className="absolute top-[-5%] left-[35%] right-[35%] h-[15%] border-b-2 border-x-2 border-white/30"></div> 
                                                <div className="absolute top-[30%] left-[35%] right-[35%] h-[15%] border-b-2 border-white/30 rounded-b-full"></div> 
                                                
                                                {/* Vertical Lines for Lanes (Faint) */}
                                                <div className="absolute top-0 bottom-0 left-[20%] border-r border-dashed border-white/10"></div>
                                                <div className="absolute top-0 bottom-0 left-[80%] border-l border-dashed border-white/10"></div>
                                                <div className="absolute top-0 bottom-0 left-[40%] border-r border-dashed border-white/10"></div>
                                                <div className="absolute top-0 bottom-0 left-[60%] border-l border-dashed border-white/10"></div>

                                                {/* Tactical Vision Cone around Ball */}
                                                <motion.div 
                                                    initial={{ x: '-50%', y: '-50%', left: `${currentScenario.b.sx}%`, top: `${currentScenario.b.sy}%` }}
                                                    animate={{ 
                                                        left: [`${currentScenario.b.sx}%`, `${currentScenario.b.ex}%`], 
                                                        top: [`${currentScenario.b.sy}%`, `${currentScenario.b.ey}%`], 
                                                        scale: [1, 1.3, 1] 
                                                    }}
                                                    transition={{ duration: 4, ease: "easeInOut", repeat: Infinity, repeatDelay: 1 }}
                                                    className="absolute w-40 h-40 bg-[radial-gradient(ellipse_at_center,_rgba(59,130,246,0.25)_0%,_transparent_70%)] rounded-full z-10 pointer-events-none"
                                                />

                                                {/* User Player (Static) */}
                                                <div className="absolute w-8 h-8 rounded-full bg-blue-600 border-2 border-white text-white font-bold text-[10px] flex items-center justify-center z-30 shadow-[0_0_15px_rgba(37,99,235,0.8)] ring-4 ring-blue-500/20" style={{ left: `${currentScenario.u.sx}%`, top: `${currentScenario.u.sy}%`, transform: 'translate(-50%, -50%)' }}>{currentScenario.u.i}</div>

                                                {/* Ball Indicator */}
                                                <motion.div 
                                                    initial={{ left: `${currentScenario.b.sx}%`, top: `${currentScenario.b.sy}%` }}
                                                    animate={{ left: [`${currentScenario.b.sx}%`, `${currentScenario.b.ex}%`], top: [`${currentScenario.b.sy}%`, `${currentScenario.b.ey}%`] }}
                                                    transition={{ duration: 4, ease: "easeInOut", repeat: Infinity, repeatDelay: 1 }}
                                                    className="absolute w-3 h-3 bg-white rounded-full z-40 shadow-[0_0_10px_white]" 
                                                    style={{ transform: 'translate(-50%, -50%)' }} 
                                                />

                                                {/* Other Players Running */}
                                                {currentScenario.p.map((player, idx) => (
                                                    <React.Fragment key={idx}>
                                                        <motion.div 
                                                            initial={{ x: '-50%', y: '-50%', left: `${player.sx}%`, top: `${player.sy}%` }}
                                                            animate={{ left: [`${player.sx}%`, `${player.ex}%`], top: [`${player.sy}%`, `${player.ey}%`] }}
                                                            transition={{ duration: 4, ease: "easeInOut", repeat: Infinity, repeatDelay: 1 }}
                                                            className={`absolute w-8 h-8 rounded-full ${player.tm === 'blue' ? 'bg-blue-600' : 'bg-red-600'} border-2 ${player.tm === 'blue' ? 'border-white' : 'border-white/50'} text-white font-bold text-[10px] flex items-center justify-center z-30 shadow-[0_5px_15px_rgba(0,0,0,0.5)]`}
                                                        >{player.i}</motion.div>
                                                        
                                                        {/* Path Trail */}
                                                        {player.sx !== player.ex && (
                                                            <svg className="absolute inset-0 w-full h-full z-10 pointer-events-none">
                                                                <motion.path 
                                                                    d={`M ${player.sx}% ${player.sy}% L ${player.ex}% ${player.ey}%`}
                                                                    stroke={player.tm === 'blue' ? "rgba(59,130,246,0.6)" : "rgba(239,68,68,0.3)"} 
                                                                    strokeWidth="2" strokeDasharray="4 4" fill="none"
                                                                />
                                                            </svg>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                                
                                                {/* Space opened up indicator at Target Area */}
                                                <motion.div
                                                    initial={{ x: '-50%', y: '-50%', left: `${currentScenario.trg.x}%`, top: `${currentScenario.trg.y}%` }}
                                                    animate={{ opacity: [0, 0, 1, 0], scale: [0.8, 0.8, 1.2, 1] }}
                                                    transition={{ duration: 4, ease: "easeInOut", repeat: Infinity, repeatDelay: 1, times: [0, 0.4, 0.6, 1] }}
                                                    className="absolute w-20 h-20 bg-yellow-400/20 rounded-full blur-xl z-20 pointer-events-none"
                                                />
                                            </div>

                                            {/* Tactical Commentary Overlay */}
                                            <div className="bg-[#161B22] rounded-3xl p-6 border border-blue-500/20 flex-shrink-0 shadow-2xl mb-8 relative overflow-hidden">
                                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500"></div>
                                                <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-1.5"><Brain size={14}/> Canlı Analiz</h4>
                                                <div className="space-y-3">
                                                    {currentScenario.a.map((txt, idx) => (
                                                        <motion.p key={idx} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + idx }} className={`text-sm font-medium leading-relaxed ${idx === currentScenario.a.length - 1 ? 'text-[#39FF14] font-bold' : 'text-gray-300'}`}>
                                                            <span className={`${idx === currentScenario.a.length - 1 ? 'text-[#39FF14]' : idx === 0 ? 'text-blue-500' : 'text-red-500'} font-bold mr-1`}>•</span> {txt}
                                                        </motion.p>
                                                    ))}
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => setLessonPhase('QUIZ')}
                                                className="w-full py-5 bg-white text-black font-black rounded-2xl text-xs tracking-widest uppercase shadow-[0_10px_30px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 flex-shrink-0 mb-4"
                                            >
                                                Anladım, Sıra Bende <ChevronLeft className="rotate-180" size={20} />
                                            </button>
                                        </motion.div>
                                    )}

                                    {lessonPhase === 'QUIZ' && (
                                        <motion.div 
                                            key="phase2"
                                            initial={{ opacity: 0, x: 50, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -50 }}
                                            transition={{ duration: 0.4, type: 'spring' }}
                                            className="flex-1 flex flex-col h-full justify-between pb-8"
                                        >
                                            <div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                                                    <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-0 leading-none">2. TEPKİ SÜRESİ</h3>
                                                </div>
                                                
                                                <div className="w-full h-1 bg-white/10 rounded-full mb-6 overflow-hidden">
                                                    <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: 15, ease: 'linear' }} className="h-full bg-orange-500" />
                                                </div>

                                                <p className="text-sm font-medium text-white mb-8 bg-gradient-to-r from-blue-900/40 to-[#050812] p-5 rounded-2xl border-l-4 border-blue-500 shadow-lg leading-relaxed">
                                                    {currentScenario.q.split('(')[0]} 
                                                    <span className="text-[#39FF14] font-black underline decoration-[#39FF14]/50">en tehlikeli</span> opsiyonun hangisi?
                                                </p>

                                                <div className="space-y-4">
                                                    {currentScenario.o.map((opt, idx) => {
                                                        const isSelected = selectedQuizIdx === idx;
                                                        const showCorrect = quizAnswerStatus === 'CORRECT' && opt.c;
                                                        const showWrong = quizAnswerStatus === 'WRONG' && !opt.c && isSelected;
                                                        const isIdle = quizAnswerStatus === 'IDLE';

                                                        return (
                                                        <button 
                                                            key={idx}
                                                            onClick={() => {
                                                                if (quizAnswerStatus === 'CORRECT') return;
                                                                setSelectedQuizIdx(idx);
                                                                setQuizAnswerStatus(opt.c ? 'CORRECT' : 'WRONG');
                                                            }}
                                                            className={`w-full p-5 rounded-2xl border-2 transition-all text-left flex items-center gap-4 relative overflow-hidden group ${
                                                                showCorrect ? 'bg-[#39FF14]/15 border-[#39FF14] shadow-[0_0_40px_rgba(57,255,20,0.2)] scale-[1.02]' 
                                                                : showWrong ? 'bg-red-500/15 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]'
                                                                : 'bg-[#161B22] border-white/5 hover:border-white/20 hover:scale-[1.01]'
                                                            }`}
                                                        >
                                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl transition-colors ${
                                                                showCorrect ? 'bg-[#39FF14] text-black shadow-[0_0_15px_#39FF14]' 
                                                                : showWrong ? 'bg-red-500 text-white' 
                                                                : 'bg-white/5 text-gray-500 group-hover:bg-white/10 group-hover:text-white'
                                                            }`}>{['A','B','C'][idx]}</div>
                                                            <span className={`flex-1 font-bold text-sm leading-tight ${
                                                                showCorrect ? 'text-[#39FF14]' 
                                                                : showWrong ? 'text-red-100' 
                                                                : 'text-gray-300 group-hover:text-white'
                                                            }`}>{opt.t}</span>
                                                            {showWrong && <X className="text-red-500 absolute right-4" size={24} />}
                                                            {showCorrect && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute inset-0 border-2 border-[#39FF14] rounded-2xl pointer-events-none" />}
                                                        </button>
                                                    )})}
                                                </div>
                                            </div>

                                            <div>
                                                <AnimatePresence>
                                                    {quizAnswerStatus === 'CORRECT' && (
                                                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] bg-[#39FF14]/10 border border-[#39FF14]/30 rounded-2xl mt-4 mb-6 flex gap-3 shadow-[0_0_30px_rgba(57,255,20,0.1)]">
                                                            <div className="mt-1"><Target size={20} className="text-[#39FF14]" /></div>
                                                            <p className="text-[#39FF14] text-sm font-medium leading-relaxed">
                                                                <strong className="block font-black uppercase tracking-wider mb-1">Doğru Hamle!</strong>
                                                                {currentScenario.f}
                                                            </p>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>

                                                <button 
                                                    disabled={quizAnswerStatus !== 'CORRECT'}
                                                    onClick={() => setLessonPhase('DRAG')}
                                                    className={`w-full py-4 mt-6 font-black rounded-2xl text-xs tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${quizAnswerStatus === 'CORRECT' ? 'bg-[#39FF14] text-black shadow-[0_10px_30px_rgba(57,255,20,0.3)] hover:scale-[1.02] active:scale-[0.98]' : 'bg-white/5 text-gray-600 cursor-not-allowed'}`}
                                                >
                                                    Sahaya İN <ChevronLeft className="rotate-180" size={16} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}

                                    {lessonPhase === 'DRAG' && (
                                        <motion.div 
                                            key="phase3"
                                            initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                                            className="flex-1 flex flex-col"
                                        >
                                            <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-2">3. SAHA UYGULAMASI</h3>
                                            <p className="text-sm font-medium text-gray-400 mb-8 max-w-[95%] leading-relaxed">{currentScenario.u.i} numaralı oyuncuyu hedef bölgeye (Sarı Alan) sürükle ve bırak.</p>

                                            <div className="relative w-full aspect-[4/3] bg-[#0B2815] rounded-[32px] border-4 border-[#161B22] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex-shrink-0 mb-8">
                                                {/* Pitch grass pattern vertical */}
                                                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 10%, rgba(0,0,0,0.5) 10%, rgba(0,0,0,0.5) 20%)' }}></div>
                                                
                                                {/* Pitch Lines - Final Third */}
                                                <div className="absolute top-[-5%] left-[20%] right-[20%] h-[35%] border-b-2 border-x-2 border-white/30"></div>
                                                <div className="absolute top-[-5%] left-[35%] right-[35%] h-[15%] border-b-2 border-x-2 border-white/30"></div>
                                                <div className="absolute top-[30%] left-[35%] right-[35%] h-[15%] border-b-2 border-white/30 rounded-b-full"></div>
                                                
                                                {/* Vertical Lines for Lanes (Faint) */}
                                                <div className="absolute top-0 bottom-0 left-[20%] border-r border-dashed border-white/10"></div>
                                                <div className="absolute top-0 bottom-0 left-[80%] border-l border-dashed border-white/10"></div>
                                                <div className="absolute top-0 bottom-0 left-[40%] border-r border-dashed border-white/10"></div>
                                                <div className="absolute top-0 bottom-0 left-[60%] border-l border-dashed border-white/10"></div>
                                                
                                                {/* Highlight Right Half-space equivalent */}
                                                <div className="absolute top-0 bottom-0 left-[60%] w-[20%] bg-yellow-400/5">
                                                    <div className="absolute top-[50%] left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-black uppercase tracking-[0.3em] text-yellow-400/30 whitespace-nowrap">Koridor</div>
                                                </div>

                                                {/* Target Drop Zone */}
                                                <div className="absolute w-20 h-20 bg-yellow-400/20 border-2 border-yellow-400 border-dashed rounded-full z-10 flex items-center justify-center shadow-[inset_0_0_20px_rgba(250,204,21,0.4)] animate-pulse" style={{ left: `${currentScenario.trg.x}%`, top: `${currentScenario.trg.y}%`, transform: 'translate(-50%, -50%)' }}>
                                                    <span className="text-yellow-400 font-bold text-[8px] uppercase tracking-widest text-center mt-6">{currentScenario.trg.l}</span>
                                                </div>

                                                {/* Decoys (Moved to their End positions) */}
                                                {currentScenario.p.map((player, idx) => (
                                                    <div key={idx} className={`absolute w-8 h-8 rounded-full ${player.tm === 'blue' ? 'bg-blue-600/50' : 'bg-red-600/50'} border-2 border-white/30 text-white/70 font-bold text-[10px] flex items-center justify-center z-20 shadow-lg`} style={{ left: `${player.ex}%`, top: `${player.ey}%`, transform: 'translate(-50%, -50%)' }}>{player.i}</div>
                                                ))}

                                                {/* Interactive User Player */}
                                                <motion.div 
                                                    drag
                                                    dragMomentum={false}
                                                    dragElastic={0.2}
                                                    dragSnapToOrigin={!dragSuccess}
                                                    onDragEnd={(e, info) => {
                                                        const xTarget = currentScenario.trg.x - currentScenario.u.sx;
                                                        const yTarget = currentScenario.trg.y - currentScenario.u.sy;
                                                        
                                                        // Require movement in general correct direction
                                                        const isCorrectDirX = (xTarget < 0 && info.offset.x < -15) || (xTarget > 0 && info.offset.x > 15) || Math.abs(xTarget) < 10;
                                                        const isCorrectDirY = (yTarget < 0 && info.offset.y < -15) || (yTarget > 0 && info.offset.y > 15) || Math.abs(yTarget) < 10;
                                                        
                                                        if (isCorrectDirX && isCorrectDirY) {
                                                            setDragSuccess(true);
                                                        }
                                                    }}
                                                    whileDrag={{ scale: 1.2, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                                                    className="absolute w-12 h-12 rounded-full bg-blue-600 border-4 border-[#39FF14] text-white font-black text-sm flex items-center justify-center z-40 cursor-grab active:cursor-grabbing shadow-[0_0_20px_rgba(57,255,20,0.4)]"
                                                    style={{ left: `${currentScenario.u.sx}%`, top: `${currentScenario.u.sy}%`, transform: 'translate(-50%, -50%)' }}
                                                >
                                                    {currentScenario.u.i}
                                                    <div className="absolute -bottom-1 -left-1 w-4 h-4 bg-white rounded-full z-50 shadow-md"></div>
                                                </motion.div>
                                            </div>

                                            <button 
                                                disabled={!dragSuccess}
                                                onClick={() => setLessonPhase('SUCCESS')}
                                                className={`mt-auto w-full py-4 font-black rounded-2xl text-xs tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${dragSuccess ? 'bg-[#39FF14] text-black shadow-[0_10px_20px_rgba(57,255,20,0.2)] hover:scale-[1.02]' : 'bg-white/5 text-gray-500 cursor-not-allowed'}`}
                                            >
                                                Analizi Tamamla <ChevronLeft className="rotate-180" size={16} />
                                            </button>
                                        </motion.div>
                                    )}

                                    {lessonPhase === 'SUCCESS' && (
                                        <motion.div 
                                            key="phase4"
                                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                            transition={{ type: "spring", damping: 20, stiffness: 100 }}
                                            className="flex-1 flex flex-col items-center justify-center text-center relative"
                                        >
                                            {/* Beautiful Glow Background */}
                                            <div className="absolute inset-0 overflow-hidden pointer-events-none flex justify-center items-center">
                                                <div className="w-64 h-64 bg-yellow-500/20 rounded-full blur-[100px]"></div>
                                                <div className="absolute w-40 h-40 bg-[#39FF14]/20 rounded-full blur-[80px]"></div>
                                            </div>

                                            <motion.div 
                                                initial={{ rotate: -180, scale: 0, y: 50 }}
                                                animate={{ rotate: 12, scale: 1, y: 0 }}
                                                transition={{ type: "spring", bounce: 0.6, duration: 1 }}
                                                className="relative w-32 h-32 bg-gradient-to-br from-yellow-300 via-amber-400 to-amber-600 rounded-[32px] flex items-center justify-center shadow-[0_0_80px_rgba(245,158,11,0.6)] mb-8 border-4 border-white z-10"
                                            >
                                                <div className="absolute -inset-2 border-2 border-dashed border-white/20 rounded-[36px] animate-[spin_10s_linear_infinite]"></div>
                                                <Brain size={60} className="text-black -rotate-12 outline-white" fill="currentColor" />
                                            </motion.div>

                                            <motion.h2 initial={{ opacity:0, y: 10 }} animate={{ opacity:1, y: 0}} transition={{delay: 0.3}} className="text-5xl font-black text-white italic uppercase tracking-tighter mb-2 drop-shadow-2xl z-10">
                                                MÜKEMMEL
                                            </motion.h2>
                                            <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{delay: 0.5}} className="text-gray-300 font-medium mb-8 max-w-[80%] z-10 text-sm leading-relaxed">
                                                <strong className="text-white block mb-1">{currentScenario.t}</strong> konseptini tam zamanında kavradın.
                                            </motion.p>

                                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.7 }} className="w-full max-w-sm flex flex-col gap-3 mb-10 z-10">
                                                <div className="flex items-center justify-between bg-white/5 border border-white/10 px-5 py-4 rounded-2xl backdrop-blur-md">
                                                    <div className="flex items-center gap-3">
                                                        <Activity className="text-blue-400" size={18} />
                                                        <span className="text-xs text-gray-300 font-bold uppercase tracking-widest">Aşama Tamamlandı</span>
                                                    </div>
                                                    <span className="text-lg font-black text-white">{currentStageIndex + 1} / 10</span>
                                                </div>
                                                <div className="flex items-center justify-between bg-gradient-to-r from-[#39FF14]/10 to-transparent border border-[#39FF14]/30 px-5 py-4 rounded-2xl backdrop-blur-md shadow-[0_0_20px_rgba(57,255,20,0.1)]">
                                                    <div className="flex items-center gap-3">
                                                        <TrendingUp className="text-[#39FF14]" size={18} />
                                                        <span className="text-xs text-gray-100 font-bold uppercase tracking-widest">Kazanılan</span>
                                                    </div>
                                                    <span className="text-2xl font-black text-[#39FF14]">+10 IQ</span>
                                                </div>
                                            </motion.div>

                                            <motion.button 
                                                initial={{ opacity:0, y: 20 }} animate={{ opacity:1, y: 0 }} transition={{delay: 1}}
                                                onClick={() => {
                                                    setUserIQ(prev => prev + 10);
                                                    if (currentStageIndex < ACADEMYS.length - 1) {
                                                        setCurrentStageIndex(prev => prev + 1);
                                                        setLessonPhase('ANIMATION'); 
                                                        setQuizAnswerStatus('IDLE');
                                                        setDragSuccess(false);
                                                    } else {
                                                        showToast("Tebrikler! 10 Aşamalı Masterclass'ı bitirdin!", "success");
                                                        setAcademyState('MENU');
                                                        setCurrentStageIndex(0);
                                                        setLessonPhase('ANIMATION');
                                                        setQuizAnswerStatus('IDLE');
                                                        setDragSuccess(false);
                                                    }
                                                }}
                                                className="w-full max-w-sm py-4 bg-white text-black font-black rounded-2xl text-xs tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_20px_40px_rgba(255,255,255,0.2)] z-10"
                                            >
                                                {currentStageIndex < ACADEMYS.length - 1 ? 'Sıradaki Aşama' : 'Eğitimi Bitir'}
                                            </motion.button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </motion.div>
                ) : viewMode === 'CURRENT' ? (
                    <motion.div 
                        key="current"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex-1 flex flex-col p-6 pb-32"
                    >
                        <div className="flex items-center gap-4 mb-8">
                            <button onClick={() => setViewMode('SELECTION')} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white shrink-0">
                                <ChevronLeft size={24} />
                            </button>
                            <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">MODERN TRENDLER</h2>
                        </div>

                        <div className="space-y-6">
                            {/* Öne çıkan analiz — açılır gerçek içerik */}
                            <div className="bg-gradient-to-br from-amber-600/10 to-orange-900/20 rounded-[32px] border border-amber-500/20 overflow-hidden shadow-2xl">
                                <div className="p-8">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
                                        <span className="text-xs font-black text-amber-500 uppercase tracking-widest">{FEATURED_TREND.tag}</span>
                                    </div>
                                    <h3 className="text-3xl font-black text-white italic uppercase leading-none mb-4">Leverkusen'in<br/>3-4-2-1 Dominansı</h3>
                                    <p className="text-sm text-gray-400 font-medium mb-8 leading-relaxed max-w-[95%]">
                                        {FEATURED_TREND.summary}
                                    </p>
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => setExpandedTrend(prev => prev === FEATURED_TREND.id ? null : FEATURED_TREND.id)}
                                            className="flex-1 py-4 bg-amber-500 text-black font-black rounded-2xl text-xs tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] transition-all"
                                        >
                                            {expandedTrend === FEATURED_TREND.id ? 'ANALİZİ KAPAT' : 'ANALİZİ OKU'}
                                        </button>
                                        <button
                                            onClick={() => setSavedTrends(prev => {
                                                const next = new Set(prev);
                                                if (next.has(FEATURED_TREND.id)) { next.delete(FEATURED_TREND.id); showToast('Kaydedilenlerden çıkarıldı.'); }
                                                else { next.add(FEATURED_TREND.id); showToast('Analiz kaydedildi.'); }
                                                return next;
                                            })}
                                            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all border ${savedTrends.has(FEATURED_TREND.id) ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-white/5 text-white border-transparent hover:bg-white/10'}`}
                                            title={savedTrends.has(FEATURED_TREND.id) ? 'Kaydedildi' : 'Kaydet'}
                                        >
                                            <Save size={20} className="hover:scale-110 transition-transform"/>
                                        </button>
                                    </div>
                                    <AnimatePresence initial={false}>
                                        {expandedTrend === FEATURED_TREND.id && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.25 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="mt-6 pt-6 border-t border-amber-500/15 space-y-4">
                                                    {FEATURED_TREND.detail.map((para, i) => (
                                                        <div key={i} className="flex gap-3">
                                                            <span className="shrink-0 w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 text-[11px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                                                            <p className="text-sm text-gray-300 leading-relaxed">{para}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Kavram kartları — tıklayınca gerçek açıklama açılır */}
                            <div className="grid grid-cols-1 gap-4">
                                {MODERN_TRENDS.map(card => {
                                    const isOpen = expandedTrend === card.id;
                                    const Icon = card.icon === 'Layout' ? Layout : card.icon === 'Target' ? Target : Layers;
                                    const accent = card.accent === 'orange'
                                        ? { icon: 'bg-orange-500/10 text-orange-400', num: 'bg-orange-500/15 text-orange-400', border: 'border-orange-500/30' }
                                        : card.accent === 'blue'
                                        ? { icon: 'bg-blue-500/10 text-blue-400', num: 'bg-blue-500/15 text-blue-400', border: 'border-blue-500/30' }
                                        : { icon: 'bg-purple-500/10 text-purple-400', num: 'bg-purple-500/15 text-purple-400', border: 'border-purple-500/30' };
                                    return (
                                        <div key={card.id} className={`bg-[#161B22] rounded-[24px] border transition-all ${isOpen ? accent.border : 'border-white/5'}`}>
                                            <button
                                                onClick={() => setExpandedTrend(prev => prev === card.id ? null : card.id)}
                                                className="w-full p-6 flex items-center justify-between group text-left"
                                            >
                                                <div className="flex items-center gap-5">
                                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform ${accent.icon}`}>
                                                        <Icon size={28} />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-base font-black text-white uppercase italic">{card.title}</h4>
                                                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{card.tag}</p>
                                                    </div>
                                                </div>
                                                <ChevronRight size={20} className={`text-gray-600 group-hover:text-white transition-all ${isOpen ? 'rotate-90 text-white' : ''}`} />
                                            </button>
                                            <AnimatePresence initial={false}>
                                                {isOpen && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.25 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="px-6 pb-6 space-y-3">
                                                            <p className="text-sm text-gray-300 leading-relaxed italic mb-1">{card.summary}</p>
                                                            {card.detail.map((para, i) => (
                                                                <div key={i} className="flex gap-3">
                                                                    <span className={`shrink-0 w-6 h-6 rounded-lg text-[11px] font-black flex items-center justify-center mt-0.5 ${accent.num}`}>{i + 1}</span>
                                                                    <p className="text-sm text-gray-300 leading-relaxed">{para}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="studio"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col min-h-[calc(100vh-6rem)]"
                    >
                        {/* Header */}
                        <header className="px-6 pt-safe pb-4 flex justify-between items-center sticky top-0 bg-[#050812]/90 backdrop-blur-xl z-30 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <button id="studio-back-button" onClick={onBack} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10">
                                    <ChevronLeft size={20} />
                                </button>
                                <div>
                                    <h1 className="text-xl font-black text-white tracking-[0.2em] uppercase">TAKTİK STUDIO</h1>
                                    <p className="text-[10px] text-[#39FF14] font-mono uppercase">Kadro & Diziliş</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => {
                                        setSaveTacticName(activeTactic.name || '');
                                        setShowSaveModal(true);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-full text-xs font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] hover:shadow-[0_0_25px_rgba(16,185,129,0.8)] transition-all"
                                >
                                    <Save size={14} /> KAYDET
                                </button>
                                <button 
                                    onClick={() => setShowExportModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full text-xs font-bold text-white shadow-[0_0_15px_rgba(147,51,234,0.5)] hover:shadow-[0_0_25px_rgba(147,51,234,0.8)] transition-all"
                                >
                                    <Send size={14} /> PAYLAŞ
                                </button>
                            </div>
                        </header>

            {/* Plan Selector */}
            <div className="px-6 pb-6 pt-2">
                <Reorder.Group 
                    axis="x" 
                    values={plans} 
                    onReorder={handleReorderPlans}
                    className="flex gap-3 overflow-x-auto no-scrollbar items-center snap-x p-1"
                >
                    {plans.map((plan, index) => {
                        const isActive = activePlanIndex === index;
                        
                        const getGroupColorStyles = (color: 'DEFAULT'|'RED'|'NAVY'|'GREEN'|undefined, isAct: boolean) => {
                            let base = '';
                            switch(color) {
                                case 'RED': base = 'bg-gradient-to-br from-red-500/20 to-rose-900/40 border-red-500/80'; break;
                                case 'NAVY': base = 'bg-gradient-to-br from-indigo-500/20 to-blue-900/40 border-indigo-500/80'; break;
                                case 'GREEN': base = 'bg-gradient-to-br from-emerald-500/20 to-green-900/40 border-emerald-500/80'; break;
                                case 'DEFAULT':
                                default:
                                    base = 'bg-gradient-to-br from-[#39FF14]/20 to-emerald-900/40 border-[#39FF14]/80';
                                    break;
                            }
                            if (isAct) {
                                switch(color) {
                                    case 'RED': return base + ' shadow-[0_0_20px_rgba(239,68,68,0.25)] ring-1 ring-red-500/50';
                                    case 'NAVY': return base + ' shadow-[0_0_20px_rgba(99,102,241,0.25)] ring-1 ring-indigo-500/50';
                                    case 'GREEN': return base + ' shadow-[0_0_20px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/50';
                                    case 'DEFAULT':
                                    default:
                                        return base + ' shadow-[0_0_20px_rgba(57,255,20,0.25)] ring-1 ring-[#39FF14]/50';
                                }
                            }
                            return base + ' hover:brightness-110';
                        };

                        const getTextColorStyles = (color: 'DEFAULT'|'RED'|'NAVY'|'GREEN'|undefined, isAct: boolean) => {
                            if (!isAct) {
                                switch(color) {
                                    case 'RED': return 'text-red-500 hover:text-red-400';
                                    case 'NAVY': return 'text-indigo-400 hover:text-indigo-300';
                                    case 'GREEN': return 'text-emerald-500 hover:text-emerald-400';
                                    case 'DEFAULT':
                                    default: return 'text-[#39FF14]/60 hover:text-[#39FF14]';
                                }
                            } else {
                                return 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]';
                            }
                        };

                        return (
                            <Reorder.Item 
                                key={plan.id}
                                value={plan}
                                dragConstraints={{ top: 0, bottom: 0 }}
                                dragElastic={0.2}
                                whileHover={{ scale: isActive ? 1 : 1.02 }}
                                whileDrag={{ scale: 1.05, zIndex: 50, cursor: 'grabbing', opacity: 0.95 }}
                                className={`relative snap-center flex-shrink-0 flex flex-col justify-between h-[80px] w-[140px] rounded-[20px] p-3 transition-colors duration-300 border cursor-grab active:cursor-grabbing ${getGroupColorStyles(plan.groupColor, isActive)}`}
                            >
                                <div className="flex justify-between items-start w-full">
                                    <div className="flex-1"></div>
                                    {isActive && editingPlanIndex !== index && (
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => handleRenamePlan(index)} className="p-1 cursor-pointer text-gray-400 hover:text-white transition-colors" title="İsmi Değiştir"><PenTool size={12}/></button>
                                            {plans.length > 1 && (
                                                <button onClick={() => handleDeletePlan(index)} className="p-1 cursor-pointer text-gray-400 hover:text-red-500 transition-colors" title="Taktik Sil"><Trash2 size={12}/></button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {editingPlanIndex === index ? (
                                    <input
                                        autoFocus
                                        value={editingPlanName}
                                        onChange={(e) => setEditingPlanName(e.target.value)}
                                        onBlur={savePlanName}
                                        onKeyDown={(e) => e.key === 'Enter' && savePlanName()}
                                        className={`text-center text-sm font-black bg-transparent outline-none w-full uppercase tracking-tighter text-[#39FF14]`}
                                        placeholder="PLAN İSMİ"
                                    />
                                ) : (
                                    <button
                                        onClick={() => handlePlanClick(index)}
                                        onDoubleClick={() => isActive && handleRenamePlan(index)}
                                        className={`text-center text-sm font-black uppercase tracking-tighter truncate w-full transition-all ${getTextColorStyles(plan.groupColor, isActive)}`}
                                    >
                                        {plan.name}
                                    </button>
                                )}
                            </Reorder.Item>
                        );
                    })}
                    
                    <button
                        onClick={handleNewTactic}
                        className="flex-shrink-0 w-[60px] h-[80px] rounded-[20px] bg-black/20 border-2 border-dashed border-white/10 hover:border-white/30 text-white/30 hover:text-white/60 transition-all flex flex-col items-center justify-center gap-1 group"
                        title="Yeni Taktik Ekle"
                    >
                        <Plus size={20} className="group-hover:scale-110 transition-transform" />
                        <span className="text-[9px] font-black tracking-widest uppercase">Ekle</span>
                    </button>
                </Reorder.Group>
            </div>

            {/* Formation & Size Selector */}
            <div className="px-6 pb-4 space-y-3">
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {(['5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'] as SquadSize[]).map(size => (
                        <button 
                            key={size}
                            onClick={() => handleSizeChange(size)}
                            className={`flex-1 min-w-[60px] py-2 rounded-xl text-[10px] font-black tracking-widest transition-all border ${activeTactic.size === size ? 'bg-[#39FF14]/20 border-[#39FF14] text-[#39FF14]' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
                        >
                            {size}
                        </button>
                    ))}
                </div>

                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {(Object.keys(FORMATIONS[activeTactic.size]) as FormationType[]).map(f => (
                        <button 
                            key={f}
                            onClick={() => handleFormationChange(f)}
                            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${activeTactic.formation === f ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Toolbar */}
            <div className="px-6 pb-4 flex gap-2 overflow-x-auto no-scrollbar">
                    <button 
                        onClick={() => setTool('move')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${tool === 'move' ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                    >
                        <MousePointer2 size={14} /> TAŞI
                    </button>
                    <button 
                        onClick={() => setTool('draw_run')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${tool === 'draw_run' ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                        title="Koşu Çiz"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="4 4"><path d="M5 12h14"></path></svg> KOŞU
                    </button>
                    <button 
                        onClick={() => setTool('draw_pass')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${tool === 'draw_pass' ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                        title="Pas Çiz"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"></path></svg> PAS
                    </button>
                    <button 
                        onClick={() => setTool('opponent')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${tool === 'opponent' ? 'bg-red-500 text-white' : 'bg-white/5 text-white hover:bg-white/10'}`}
                    >
                        <Swords size={14} /> RAKİP EKLE
                    </button>
                    {drawings.length > 0 && (
                        !isAdvancedAnimLoaded ? (
                            // ⚡ Modül henüz indirilmedi: on-demand indirme butonu
                            <button
                                onClick={loadAdvancedAnimation}
                                disabled={isLoadingAdvancedAnim}
                                className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap shadow-lg bg-[#FACC15] text-black shadow-[#FACC15]/30 hover:scale-105 disabled:opacity-60"
                                title="Gelişmiş animasyon motorunu indir ve oynat"
                            >
                                {isLoadingAdvancedAnim ? (
                                    <><Loader2 size={14} className="animate-spin" /> MODÜL İNDİRİLİYOR...</>
                                ) : (
                                    <><Zap size={14} className="fill-current" /> GELİŞMİŞ ANİMASYON</>
                                )}
                            </button>
                        ) : (
                            // Modül indirildi: lazy toolbar kontrolleri
                            <Suspense fallback={
                                <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black bg-white/5 text-gray-400 whitespace-nowrap">
                                    <Loader2 size={14} className="animate-spin" /> Gelişmiş animasyon modülü indiriliyor...
                                </div>
                            }>
                                <AnimationToolbar
                                    isSimulating={isSimulating}
                                    setIsSimulating={setIsSimulating}
                                    showBall={showBall}
                                    setShowBall={setShowBall}
                                    playMode={playMode}
                                    setPlayMode={setPlayMode}
                                />
                            </Suspense>
                        )
                    )}
                    <div className="w-px h-8 bg-white/10 mx-1"></div>
                    <button 
                        onClick={() => {
                            setIsSimulating(false);
                            setActiveTactic({...activeTactic, opponents: [], drawings: []});
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-white/5 text-white hover:bg-red-500/20 hover:text-red-500 transition-all whitespace-nowrap"
                    >
                        <Trash2 size={14} /> TEMİZLE
                    </button>
                </div>

            {/* Pitch Area */}
            <div className="px-6 relative z-10 max-w-md mx-auto w-full">
                <div 
                    ref={canvasRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    className={`relative w-full aspect-[3/4] bg-[#0B2815] rounded-[24px] border-4 border-[#161B22] shadow-[inset_0_0_60px_rgba(0,0,0,0.8)] overflow-hidden ${tool.startsWith('draw') ? 'cursor-crosshair touch-none' : ''} ${tool === 'opponent' ? 'cursor-copy touch-none' : ''}`}
                >
                    {/* Grass Stripes */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(0,0,0,0.2) 10%, rgba(0,0,0,0.2) 20%)' }}></div>
                    
                    {/* Pitch Markings (Halı Saha Style) */}
                    <div className="absolute inset-0 pointer-events-none opacity-30">
                        <svg viewBox="0 0 600 1000" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                            <g stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                {/* Dış Çizgiler */}
                                <rect x="10" y="10" width="580" height="980" />
                                {/* Orta Çizgi */}
                                <line x1="10" y1="500" x2="590" y2="500" />
                                {/* Orta Yuvarlak */}
                                <circle cx="300" cy="500" r="80" />
                                <circle cx="300" cy="500" r="4" fill="white" />
                                
                                {/* Üst Ceza Sahası */}
                                <rect x="150" y="10" width="300" height="160" />
                                <circle cx="300" cy="130" r="4" fill="white" />
                                <path d="M 220 170 A 80 80 0 0 0 380 170" />
                                
                                {/* Alt Ceza Sahası */}
                                <rect x="150" y="830" width="300" height="160" />
                                <circle cx="300" cy="870" r="4" fill="white" />
                                <path d="M 220 830 A 80 80 0 0 1 380 830" />

                                {/* Köşe Vuruşu Yayları */}
                                <path d="M 10 40 A 30 30 0 0 0 40 10" />
                                <path d="M 560 10 A 30 30 0 0 0 590 40" />
                                <path d="M 10 960 A 30 30 0 0 1 40 990" />
                                <path d="M 590 960 A 30 30 0 0 0 560 990" />
                            </g>
                        </svg>
                    </div>

                    {/* Drawings Layer */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                            <defs>
                                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#39FF14" />
                                </marker>
                            </defs>
                            {drawings.map(line => (
                                <path 
                                    key={line.id}
                                    d={getSmoothPathStr(line.points, canvasRef.current!.clientWidth, canvasRef.current!.clientHeight)}
                                    fill="none"
                                    stroke={line.color}
                                    strokeWidth="3"
                                    strokeDasharray={line.type === 'line' ? '8,8' : 'none'}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    markerEnd="url(#arrowhead)"
                                    opacity={isSimulating ? "0.3" : "0.8"}
                                    className="transition-opacity duration-500"
                                />
                            ))}
                            {currentLine && (
                                <path 
                                    d={getSmoothPathStr(currentLine.points, canvasRef.current!.clientWidth, canvasRef.current!.clientHeight)}
                                    fill="none"
                                    stroke={currentLine.color}
                                    strokeWidth="3"
                                    strokeDasharray={currentLine.type === 'line' ? '8,8' : 'none'}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    markerEnd="url(#arrowhead)"
                                    opacity="0.8"
                                />
                            )}
                        </svg>

                    {/* Opponents */}
                    {activeTactic.opponents.map(opp => {
                        const path = drawings.find(d => d.attachedTo === opp.id && d.type === 'line');
                        const isMoving = isSimulating && path && advancedAnimApiRef.current;
                        const anim = path && isMoving ? advancedAnimApiRef.current!(path, isSimulating, playMode, seqMap.get(path.id)!, totalSeqDuration) : null;
                        return (
                        <motion.div 
                            key={opp.id}
                            onPointerDown={(e) => handleDragStart('opponent', opp.id, e)}
                            className={`absolute w-10 h-10 z-20 ${tool === 'move' ? 'cursor-grab active:cursor-grabbing touch-none' : 'pointer-events-auto'} ${isMoving ? 'brightness-125 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]' : ''}`}
                            animate={anim ? anim.animate : {
                                left: `${opp.x}%`,
                                top: `${opp.y}%`
                            }}
                            transition={anim ? anim.transition as any : (draggedItem?.id === opp.id ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 })}
                            style={{ x: "-50%", y: "-50%", zIndex: draggedItem?.id === opp.id ? 50 : 20 }}
                        >
                            <div className={`relative w-full h-full rounded-full border-2 flex items-center justify-center shadow-lg bg-red-900/80 border-red-500 text-white`}>
                                <Swords size={16} />
                            </div>
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 flex flex-col items-center pointer-events-none">
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-950/80 text-red-200 whitespace-nowrap border border-red-500/30">
                                    {opp.player?.name}
                                </span>
                                {opp.instruction && (
                                    <span className="text-[8px] font-bold mt-0.5 bg-black/40 px-1 rounded text-red-400">
                                        {opp.instruction}
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    )})}

                    {/* Slots */}
                    {activeTactic.slots.map(slot => {
                        const path = drawings.find(d => d.attachedTo === slot.id && d.type === 'line');
                        const isMoving = isSimulating && path && advancedAnimApiRef.current;
                        const anim = path && isMoving ? advancedAnimApiRef.current!(path, isSimulating, playMode, seqMap.get(path.id)!, totalSeqDuration) : null;
                        return (
                        <motion.div 
                            key={slot.id}
                            layout={draggedItem?.id === slot.id ? false : true}
                            animate={anim ? anim.animate : {
                                left: `${slot.x}%`,
                                top: `${slot.y}%`
                            }}
                            transition={anim ? anim.transition as any : (draggedItem?.id === slot.id ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 })}
                            onPointerDown={(e) => {
                                if (tool === 'move' && slot.player) {
                                    handleDragStart('slot', slot.id, e);
                                }
                            }}
                            className={`absolute w-12 h-12 z-20 ${tool === 'move' && slot.player ? 'cursor-grab active:cursor-grabbing touch-none' : ''} ${isMoving ? 'brightness-125 drop-shadow-[0_0_15px_rgba(57,255,20,0.8)]' : ''}`}
                            style={{ x: "-50%", y: "-50%", zIndex: draggedItem?.id === slot.id ? 50 : 20 }}
                        >
                            {slot.player ? (
                                <motion.div 
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    className={`relative w-full h-full rounded-full border-2 flex items-center justify-center shadow-[0_4px_15px_rgba(0,0,0,0.5)] ${slot.role === 'GK' ? 'bg-gradient-to-br from-orange-400 to-orange-600 border-orange-300' : 'bg-gradient-to-br from-[#1e2532] to-[#11151c] border-white/30'}`}
                                >
                                    <span className="text-white font-black text-sm drop-shadow-md">{slot.player.name.charAt(0)}</span>
                                    {activeTactic.captainId === slot.player.id && (
                                        <div className="absolute -top-2 -right-2 w-5 h-5 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full flex items-center justify-center text-black text-[10px] font-black border-2 border-[#161B22] shadow-sm">
                                            K
                                        </div>
                                    )}
                                    {slot.archetype && slot.archetype !== 'NONE' && (
                                        <div 
                                            className="absolute -bottom-2 -right-2 w-6 h-6 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full flex items-center justify-center text-black text-xs border-2 border-[#161B22] shadow-lg z-30"
                                        >
                                            {ARCHETYPES[slot.archetype].icon}
                                        </div>
                                    )}
                                </motion.div>
                            ) : (
                                <motion.button 
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => setShowPlayerSelect({ type: 'slot', slotId: slot.id })}
                                    className={`relative w-full h-full rounded-full border-2 border-dashed flex items-center justify-center bg-black/20 backdrop-blur-sm transition-colors ${slot.role === 'GK' ? 'border-orange-500/50 text-orange-500 hover:border-orange-400' : 'border-[#39FF14]/50 text-[#39FF14]/70 hover:border-[#39FF14] hover:text-[#39FF14]'}`}
                                >
                                    <Plus size={20} />
                                </motion.button>
                            )}
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 flex flex-col items-center pointer-events-none">
                                {slot.player && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded text-white whitespace-nowrap ${slot.player?.isCustom ? 'bg-purple-600/80 border border-purple-400/50' : 'bg-black/60'}`}>
                                        {slot.player.name}
                                    </span>
                                )}
                                {slot.instruction && (
                                    <span className={`text-[8px] font-bold mt-0.5 bg-black/40 px-1 rounded text-[#39FF14]`}>
                                        {slot.instruction}
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    )})}

                    {/* ⚡ GELİŞMİŞ ANİMASYON OVERLAY (lazy) — top animasyonu + sekans/timeline editörü.
                        Yalnız modül indirildiğinde mount edilir; ağır kısım buradadır. */}
                    {isAdvancedAnimLoaded && (
                        <Suspense fallback={null}>
                            <AdvancedAnimationModule
                                drawings={drawings}
                                isSimulating={isSimulating}
                                showBall={showBall}
                                playMode={playMode}
                                seqMap={seqMap}
                                totalSeqDuration={totalSeqDuration}
                                selectedSeqBadge={selectedSeqBadge}
                                setSelectedSeqBadge={setSelectedSeqBadge}
                                isCustomSeqInputOpen={isCustomSeqInputOpen}
                                setIsCustomSeqInputOpen={setIsCustomSeqInputOpen}
                                customSeqValue={customSeqValue}
                                setCustomSeqValue={setCustomSeqValue}
                                setDrawings={setDrawings}
                            />
                        </Suspense>
                    )}
                </div>
            </div>

            {/* Team Selection & Auto Fill */}
            {!isTeamConfirmed && (
            <div className="px-6 pb-6 mt-4">
                <div className="bg-[#161B22] rounded-[32px] border border-white/5 p-5 shadow-[0_4px_40px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <Users size={14} className="text-[#39FF14]" /> TAKIM SEÇİMİ
                        </h3>
                    </div>
                    
                    {/* Horizontal Team List — kanonik get_my_teams (hayalet güç puanı öldü) */}
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 mb-4">
                        {studioTeams.map((team) => (
                            <button
                                key={team.team_id}
                                onClick={() => { setSelectedTeamId(team.team_id); void ensureSquad(team.team_id); }}
                                className={`flex-shrink-0 w-[140px] p-3 rounded-2xl border transition-all text-left ${
                                    selectedTeamId === team.team_id
                                        ? 'bg-[#39FF14]/10 border-[#39FF14]/50 shadow-[0_0_15px_rgba(57,255,20,0.2)]'
                                        : 'bg-white/5 border-white/5 hover:bg-white/10'
                                }`}
                            >
                                <h4 className="text-white font-bold text-xs mb-1 truncate">{team.name}</h4>
                                <div className="text-[10px] font-bold text-gray-500">
                                    <span className={selectedTeamId === team.team_id ? 'text-[#39FF14]' : 'text-white'}>{team.member_count}</span> oyuncu · {formatLabel(team.format)}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col gap-2">
                        {selectedTeamId && !isSquadComplete && (
                            <button
                                onClick={() => {
                                    void (async () => {
                                        try {
                                            const squad = await ensureSquad(selectedTeamId);
                                            const teamRow = studioTeams.find(t => t.team_id === selectedTeamId);
                                            setActiveTactic({
                                                ...activeTactic,
                                                slots: populateSlotsWithSquad(squad, activeTactic.slots),
                                                teamName: teamRow?.name,
                                                teamId: selectedTeamId,
                                            });
                                            setIsTeamConfirmed(true);
                                        } catch (e) {
                                            console.error('[Studio] kadro yüklenemedi', e);
                                            showToast('Kadro yüklenemedi.', 'error');
                                        }
                                    })();
                                }}
                                className="w-full h-12 bg-gradient-to-r from-[#39FF14] to-emerald-600 rounded-2xl flex items-center justify-center gap-2 text-black font-black text-[10px] tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(57,255,20,0.3)] animate-pulse"
                            >
                                <Users size={16} />
                                SEÇİLİ TAKIMI ONAYLA
                            </button>
                        )}
                        
                        {isSquadComplete && (
                            <button
                                onClick={() => setIsTeamConfirmed(true)}
                                className="w-full h-12 bg-gradient-to-r from-[#39FF14] to-emerald-600 rounded-2xl flex items-center justify-center gap-2 text-black font-black text-[10px] tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(57,255,20,0.3)] animate-pulse"
                            >
                                <Users size={16} />
                                KADROYU ONAYLA
                            </button>
                        )}

                        <button
                            onClick={() => setShowPlayerSelect({ type: 'any' })}
                            className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center gap-2 text-white font-black text-[10px] tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)]"
                        >
                            <Users size={16} className="text-yellow-400" />
                            KAYITLI ARKADAŞLARI GÖSTER
                        </button>
                    </div>
                </div>
            </div>
            )}

            {/* Tactical Settings (Mentality & Tempo) Redesign */}
            <div className="px-6 pb-6 mt-8">
                <div className="grid grid-cols-2 gap-4">
                    {/* Mentality */}
                    <div className="bg-[#161B22] rounded-[32px] border border-white/5 p-5 shadow-[0_4px_40px_rgba(0,0,0,0.5)]">
                        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2 mb-4">
                            <Shield size={14} className="text-yellow-400" /> MENTALİTE
                        </h3>
                        <div className="flex flex-col gap-2">
                            {(['Defensive', 'Balanced', 'Attacking'] as const).map(m => (
                                <button 
                                    key={m}
                                    onClick={() => setActiveTactic({ ...activeTactic, mentality: m })}
                                    className={`w-full py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                        activeTactic.mentality === m 
                                            ? 'bg-yellow-400/10 border-yellow-400/50 text-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.2)]'
                                            : 'bg-white/5 border-transparent text-white hover:bg-white/10'
                                    }`}
                                >
                                    {m === 'Defensive' ? 'DEFANSİF' : m === 'Balanced' ? 'DENGELİ' : 'HÜCUMCU'}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    {/* Tempo */}
                    <div className="bg-[#161B22] rounded-[32px] border border-white/5 p-5 shadow-[0_4px_40px_rgba(0,0,0,0.5)]">
                        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2 mb-4">
                            <Gauge size={14} className="text-blue-400" /> TEMPO
                        </h3>
                        <div className="flex flex-col gap-2">
                            {(['Slow', 'Normal', 'Fast'] as const).map(t => (
                                <button 
                                    key={t}
                                    onClick={() => setActiveTactic({ ...activeTactic, tempo: t })}
                                    className={`w-full py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                        activeTactic.tempo === t 
                                            ? 'bg-blue-400/10 border-blue-400/50 text-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.2)]'
                                            : 'bg-white/5 border-transparent text-white hover:bg-white/10'
                                    }`}
                                >
                                    {t === 'Slow' ? 'YAVAŞ' : t === 'Normal' ? 'NORMAL' : 'HIZLI'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Section Specific Content */}
            {/* Player List & Instructions Panel */}
            {allPlayersOnPitch.length > 0 && (
                <div className="px-6 mt-6">
                    <div className="bg-[#161B22] rounded-2xl border border-white/10 overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <Users size={16} className={'text-[#39FF14]'} /> 
                                Oyuncular
                            </h3>
                            <button 
                                onClick={() => setShowPlayerSelect({ type: 'any' })}
                                className="w-8 h-8 rounded-full bg-[#39FF14]/20 flex items-center justify-center text-[#39FF14] hover:bg-[#39FF14]/30 transition-colors"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        <div className="divide-y divide-white/5">
                            {allPlayersOnPitch.map((item) => (
                                <div key={item.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-white ${item.type === 'opponent' ? 'bg-red-500' : (item.role === 'GK' ? 'bg-orange-500' : 'bg-[#39FF14] text-black')}`}>
                                            {item.type === 'opponent' ? <Swords size={16} /> : item.player?.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-white font-bold text-sm">{item.player?.name}</h4>
                                                {item.type === 'opponent' && <span className="bg-red-500/20 text-red-400 text-[8px] px-1.5 py-0.5 rounded border border-red-500/30">RAKİP</span>}
                                                {item.player?.isCustom && <span className="bg-purple-500/20 text-purple-400 text-[8px] px-1.5 py-0.5 rounded border border-purple-500/30">HAYALİ</span>}
                                                {activeTactic.captainId === item.player?.id && <span className="bg-yellow-400/20 text-yellow-400 text-[8px] px-1.5 py-0.5 rounded border border-yellow-400/30">KAPTAN</span>}
                                            </div>
                                            <p className="text-[10px] text-gray-500 font-bold mt-0.5">
                                                {item.type === 'slot' ? (
                                                    item.archetype && item.archetype !== 'NONE' ? (
                                                        <span className="text-purple-400">
                                                            Rol: {ARCHETYPES[item.archetype].label} {ARCHETYPES[item.archetype].icon}
                                                        </span>
                                                    ) : (
                                                        'Rol atanmadı'
                                                    )
                                                ) : (
                                                    item.instruction ? (
                                                        <span className={item.type === 'opponent' ? 'text-red-400' : 'text-[#39FF14]'}>
                                                            Görev: {item.instruction}
                                                        </span>
                                                    ) : (
                                                        'Görev atanmadı'
                                                    )
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        {item.type === 'slot' && (
                                            <button 
                                                onClick={() => handleSetCaptain(item.player!.id)}
                                                className={`p-2 rounded-lg transition-all ${activeTactic.captainId === item.player?.id ? 'bg-yellow-400/20 text-yellow-400' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                                            >
                                                <Star size={16} className={activeTactic.captainId === item.player?.id ? 'fill-current' : ''} />
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => item.type === 'slot' ? setSelectedSlotForArchetype(item.id) : setInstructionModal({ type: item.type, id: item.id })}
                                            className={`p-2 rounded-lg transition-all ${((item.type === 'slot' && item.archetype && item.archetype !== 'NONE') || (item.type !== 'slot' && item.instruction)) ? 'bg-[#39FF14]/20 text-[#39FF14]' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                                        >
                                            {item.type === 'slot' ? <Brain size={16} /> : <MessageSquare size={16} />}
                                        </button>
                                        <button 
                                            onClick={() => item.type === 'slot' ? handleRemovePlayer(item.id) : handleRemoveOpponent(item.id)}
                                            className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="px-6 mt-6 pb-32">
                <div className="flex gap-2 w-full">
                    <button 
                        onClick={() => setShowTacticsModal(true)}
                        className="w-1/3 h-14 bg-[#161B22] border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-1 text-white hover:bg-white/5 transition-all group"
                    >
                        <List size={18} className="text-gray-400 group-hover:text-white transition-colors" />
                        <span className="font-black text-[9px] tracking-widest text-[#39FF14]">TAKTİKLER</span>
                    </button>
                    
                    <button 
                        onClick={() => setShowResetConfirmModal(true)}
                        className="w-1/3 h-14 bg-[#161B22] border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-1 text-white hover:bg-white/5 transition-all group"
                    >
                        <Plus size={18} className="text-gray-400 group-hover:text-white transition-colors" />
                        <span className="font-black text-[9px] tracking-widest text-[#39FF14]">YENİ TAKTİK</span>
                    </button>
                    
                    <div className="w-1/3 relative group">
                        <button 
                            disabled={!canSave}
                            onClick={() => {
                                setSaveTacticName(activeTactic.name || '');
                                setShowSaveModal(true);
                            }}
                            className="w-full h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-black font-black text-[9px] tracking-widest disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] transition-all bg-[#39FF14] shadow-[0_0_20px_rgba(57,255,20,0.2)]"
                        >
                            <Save size={18} className="mb-0.5" />
                            KAYDET
                        </button>
                        {!canSave && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-red-500/90 text-white text-[10px] font-bold p-2 rounded-lg text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                Kadroyu tamamlayın ve kaleci seçin.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Archetype Selection Modal */}
            <AnimatePresence>
                {selectedSlotForArchetype && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-6"
                        onClick={() => setSelectedSlotForArchetype(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#161B22] border border-white/10 rounded-[32px] w-full max-w-sm p-6 shadow-2xl" 
                            onClick={e => e.stopPropagation()}
                        >
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <Brain size={20} className="text-purple-400" /> ROL ATA
                            </h3>
                            <button onClick={() => setSelectedSlotForArchetype(null)} className="p-2 text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto no-scrollbar pb-4">
                            {Object.entries(ARCHETYPES).map(([key, arch]) => (
                                <button
                                    key={key}
                                    onClick={() => {
                                        const newSlots = activeTactic.slots.map(s => 
                                            s.id === selectedSlotForArchetype ? { ...s, archetype: key as Archetype } : s
                                        );
                                        setActiveTactic({ ...activeTactic, slots: newSlots });
                                        setSelectedSlotForArchetype(null);
                                    }}
                                    className={`flex items-center gap-4 p-4 rounded-2xl border text-left transition-all ${
                                        activeTactic.slots.find(s => s.id === selectedSlotForArchetype)?.archetype === key 
                                        ? 'bg-purple-500/20 border-purple-500/50' 
                                        : 'bg-white/5 border-white/5 hover:bg-white/10'
                                    }`}
                                >
                                    <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-xl">
                                        {arch.icon || <X size={16} className="text-gray-500" />}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-sm">{arch.label}</h4>
                                        {arch.hint && <p className="text-[10px] text-gray-400 mt-1">{arch.hint}</p>}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>

            {/* Instruction Modal */}
            <AnimatePresence>
                {instructionModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#161B22] border border-white/10 rounded-2xl p-6 w-full max-w-sm"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-black text-white uppercase tracking-widest">Görev Ver</h3>
                                <button onClick={() => setInstructionModal(null)} className="text-gray-400 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {INSTRUCTIONS.map(inst => (
                                    <button 
                                        key={inst}
                                        onClick={() => handleSetInstruction(instructionModal.type, instructionModal.id, inst)}
                                        className={`py-3 rounded-xl text-xs font-bold transition-all ${instructionModal.type === 'opponent' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' : 'bg-[#39FF14]/10 text-[#39FF14] hover:bg-[#39FF14]/20 border border-[#39FF14]/20'}`}
                                    >
                                        {inst}
                                    </button>
                                ))}
                                <button 
                                    onClick={() => handleSetInstruction(instructionModal.type, instructionModal.id, '')}
                                    className="col-span-2 py-3 rounded-xl text-xs font-bold bg-white/5 text-gray-400 hover:bg-white/10 transition-all border border-white/10"
                                >
                                    Görevi Temizle
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Player Selection Modal */}
            <AnimatePresence>
                {showPlayerSelect && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex flex-col"
                    >
                        <div className="flex-1 overflow-y-auto p-6 pt-20 max-w-md mx-auto w-full">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-xl font-black text-white uppercase tracking-widest italic">Oyuncu Seç</h2>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest text-[#39FF14]`}>
                                        Kayıtlı Arkadaşlar & Takımlar
                                    </p>
                                </div>
                                <button 
                                    onClick={() => {
                                        setShowPlayerSelect(null);
                                        setSelectedTeamRosterId(null);
                                    }}
                                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Navigation Tabs (Friends / Teams / Custom) */}
                            <div className="flex bg-black/40 backdrop-blur-md rounded-2xl p-1 border border-white/10 mb-6 relative z-10">
                                {[
                                  { id: 'FRIENDS', label: 'Arkadaşlarım', icon: Users },
                                  { id: 'TEAMS', label: 'Takımlarım', icon: Swords },
                                  { id: 'CUSTOM', label: 'Hayali', icon: Type }
                                ].map(tab => {
                                  const Icon = tab.icon;
                                  return (
                                    <button 
                                      key={tab.id}
                                      onClick={() => setModalTab(tab.id as any)}
                                      className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all relative ${modalTab === tab.id ? 'text-[#39FF14]' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                      {modalTab === tab.id && (
                                        <motion.div layoutId="modalNav" className="absolute inset-0 bg-white/10 border border-white/5 rounded-xl" />
                                      )}
                                      <Icon size={14} className="relative z-10" />
                                      <span className="relative z-10">{tab.label}</span>
                                    </button>
                                  );
                                })}
                            </div>

                            {/* TAB 1: FRIENDS */}
                            {modalTab === 'FRIENDS' && (
                                <div className="space-y-4">
                                    {/* Groups list switcher (from CommunityView) */}
                                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar items-center">
                                        {groups.map(group => (
                                            <button 
                                                key={group} 
                                                onClick={() => setSelectedGroup(group)}
                                                className={`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5 ${selectedGroup === group ? (group === 'Favorilerim' ? 'bg-[#FACC15] text-black border-[#FACC15] shadow-[0_0_15px_rgba(250,204,21,0.3)]' : 'bg-white text-black border-white shadow-lg') : 'bg-transparent text-gray-500 border-white/10 hover:border-white/30'}`}
                                            >
                                                {group === 'Favorilerim' && <Star size={12} fill={selectedGroup === group ? "black" : "currentColor"} className={selectedGroup === group ? 'text-black' : 'text-gray-500'} />}
                                                {group}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Friends list (from CommunityView style) */}
                                    <div className="grid gap-3">
                                        {friends && friends.filter(f => {
                                            if (selectedGroup === 'Tümü') return true;
                                            if (selectedGroup === 'Favorilerim') return f.isFavorite;
                                            return f.group === selectedGroup;
                                        }).length === 0 ? (
                                            <div className="text-center py-8 bg-[#161B22]/50 border border-white/5 rounded-2xl">
                                                <p className="text-gray-500 font-bold text-xs uppercase tracking-wider">Arkadaş Bulunamadı</p>
                                            </div>
                                        ) : (
                                            friends && friends.filter(f => {
                                                if (selectedGroup === 'Tümü') return true;
                                                if (selectedGroup === 'Favorilerim') return f.isFavorite;
                                                return f.group === selectedGroup;
                                            }).map(friend => (
                                                <button 
                                                    key={friend.id} 
                                                    onClick={() => {
                                                        const p: Player = {
                                                            id: friend.id,
                                                            name: friend.name,
                                                            role: friend.pos || 'CM',
                                                            rating: friend.fp || 80,
                                                            isCustom: false
                                                        };
                                                        handleSelectPlayer(p);
                                                    }}
                                                    className="w-full bg-gradient-to-br from-[#161B22] to-[#0A0E14] border border-white/5 rounded-3xl p-4 flex items-center justify-between hover:border-[#39FF14]/50 transition-all text-left relative group overflow-hidden"
                                                >
                                                    <div className="flex items-center gap-4 pointer-events-none">
                                                        <div className="relative">
                                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center font-black text-lg border border-white/10 shadow-lg group-hover:bg-[#39FF14] group-hover:text-black transition-all">
                                                                {friend.name.charAt(0)}
                                                            </div>
                                                            {friend.online && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#39FF14] rounded-full border-[3px] border-[#0A0E14] shadow-[0_0_10px_rgba(57,255,20,0.5)]" />}
                                                        </div>
                                                        <div>
                                                            <h4 className="text-base font-black text-white tracking-tight flex items-center gap-2 group-hover:text-[#39FF14] transition-colors">
                                                                {friend.name}
                                                                {friend.isFavorite && <Star size={12} className="text-[#FACC15]" fill="#FACC15" />}
                                                            </h4>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <Hash size={10} className="text-gray-500" />
                                                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">{friend.group}</span>
                                                                <span className="text-gray-700 text-[10px]">•</span>
                                                                <span className="text-[10px] font-bold text-gray-500">{friend.pos}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 pointer-events-none">
                                                        <div className="flex flex-col items-end gap-1">
                                                            <div className="flex items-end gap-[3px] h-4">
                                                                {[1, 2, 3, 4, 5].map(level => {
                                                                    const matches = (friend.wins || 0) + (friend.losses || 0);
                                                                    const activityLevel = Math.min(5, Math.max(1, Math.ceil(matches / 6)));
                                                                    const isActive = level <= activityLevel;
                                                                    const colors = ['bg-[#FACC15]', 'bg-amber-400', 'bg-orange-500', 'bg-rose-500', 'bg-red-600'];
                                                                    return (
                                                                        <div 
                                                                            key={level} 
                                                                            className={`w-1.5 rounded-sm transition-colors duration-500 ${isActive ? colors[activityLevel - 1] : 'bg-white/10'}`} 
                                                                            style={{ height: `${40 + level * 15}%` }} 
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                            <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest">Aktiflik</span>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white/50 group-hover:border-[#39FF14] group-hover:text-[#39FF14] transition-all ml-2">
                                                            <Plus size={16} />
                                                        </div>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* TAB 2: TEAMS */}
                            {modalTab === 'TEAMS' && (
                                <div className="space-y-4">
                                    {selectedTeamRosterId === null ? (
                                        <div className="grid gap-3">
                                            {studioTeams.length === 0 ? (
                                                <div className="text-center py-8 bg-[#161B22]/50 border border-white/5 rounded-2xl">
                                                    <p className="text-gray-500 font-bold text-xs uppercase tracking-wider">Takım Bulunamadı</p>
                                                </div>
                                            ) : (
                                                studioTeams.map(team => (
                                                    <div
                                                        key={team.team_id}
                                                        onClick={() => { setSelectedTeamRosterId(team.team_id); void ensureSquad(team.team_id); }}
                                                        className="bg-gradient-to-br from-[#161B22] to-[#0A0E14] border border-white/5 rounded-3xl p-4 flex items-center justify-between cursor-pointer hover:border-[#39FF14]/50 transition-all group"
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-black text-xl shadow-lg transition-transform group-hover:scale-105" style={{ backgroundColor: team.color1 || '#10B981' }}>
                                                                {(team.short_name || team.name).charAt(0)}
                                                            </div>
                                                            <div>
                                                                <h3 className="text-base font-black text-white tracking-tight group-hover:text-[#39FF14] transition-colors">{team.name}</h3>
                                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{team.member_count} Oyuncu{team.city ? ` • ${team.city}` : ''}</p>
                                                            </div>
                                                        </div>
                                                        <ChevronRight className="text-gray-500 group-hover:translate-x-1 transition-transform" />
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-3 animate-fade-blur-in">
                                            <button
                                                onClick={() => setSelectedTeamRosterId(null)}
                                                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4 border border-white/10 px-3 py-1.5 rounded-xl bg-white/5 w-max"
                                            >
                                                <ChevronLeft size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Takımlara Dön</span>
                                            </button>

                                            <h3 className="text-[10px] font-black text-[#39FF14] mb-3 uppercase tracking-widest">
                                                {studioTeams.find(t => t.team_id === selectedTeamRosterId)?.name} KADROSU
                                            </h3>

                                            {/* GERÇEK kadro (get_team_squad) — hayalet roster öldü */}
                                            {!squadsByTeam[selectedTeamRosterId] ? (
                                                <div className="py-8 flex justify-center">
                                                    <Loader2 size={20} className="animate-spin text-white/40" />
                                                </div>
                                            ) : (
                                                squadsByTeam[selectedTeamRosterId].map(m => (
                                                    <button
                                                        key={m.user_id}
                                                        onClick={() => handleSelectPlayer(squadRowToPlayer(m))}
                                                        className="w-full bg-gradient-to-br from-[#161B22] to-[#0A0E14] border border-white/5 rounded-3xl p-4 flex items-center justify-between hover:border-[#39FF14]/50 transition-all text-left group"
                                                    >
                                                        <div className="flex items-center gap-4 pointer-events-none">
                                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center font-black text-lg border border-white/10 shadow-lg group-hover:bg-[#39FF14] group-hover:text-black transition-all">
                                                                {m.full_name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <h4 className="text-base font-black text-white tracking-tight group-hover:text-[#39FF14] transition-colors">{m.full_name}</h4>
                                                                <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">
                                                                    {m.pos || 'OYUNCU'}{m.jersey_number != null ? ` • #${m.jersey_number}` : ''}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white/50 group-hover:border-[#39FF14] group-hover:text-[#39FF14] transition-all pointer-events-none">
                                                            <Plus size={16} />
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 3: CUSTOM PLAYER */}
                            {modalTab === 'CUSTOM' && (
                                <div className="space-y-4">
                                    <div className="bg-purple-900/20 border border-purple-500/30 rounded-[24px] p-5">
                                        <h3 className="text-sm font-black text-purple-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
                                            <Type size={16} /> Hayali Oyuncu Yarat
                                        </h3>
                                        <p className="text-xs text-purple-300/70 mb-4 leading-relaxed">
                                            Taktik tahtasında simüle etmek istediğiniz herhangi bir hayali oyuncuyu adlandırın ve mevkisini seçin.
                                        </p>
                                        <div className="flex gap-2 mb-3">
                                            <input 
                                                type="text"
                                                placeholder="Oyuncu Adı (Örn: X Oyuncusu)"
                                                value={customPlayerName}
                                                onChange={(e) => setCustomPlayerName(e.target.value)}
                                                className="flex-1 bg-[#161B22] border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                                            />
                                            <select 
                                                value={customPlayerRole}
                                                onChange={(e) => setCustomPlayerRole(e.target.value)}
                                                className="bg-[#161B22] border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="-">-</option>
                                                <option value="FWD">FWD</option>
                                                <option value="MID">MID</option>
                                                <option value="DEF">DEF</option>
                                                <option value="GK">GK</option>
                                            </select>
                                        </div>
                                        <button 
                                            onClick={handleCreateCustomPlayer}
                                            disabled={!customPlayerName.trim()}
                                            className="w-full bg-purple-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-purple-700 active:scale-95 transition-all shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                                        >
                                            <UserPlus size={16} /> Yarat ve Ekle
                                        </button>
                                    </div>
                                </div>
                            )}

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Export Modal */}
            <AnimatePresence>
                {showExportModal && (
                    <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[60] flex flex-col overflow-y-auto custom-scrollbar">
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="min-h-screen w-full flex flex-col items-center p-6 pb-12"
                        >
                            {/* Modal Header */}
                            <div className="w-full max-w-sm flex items-center justify-between mb-8 sticky top-0 z-10 py-2">
                                <button 
                                    onClick={() => setShowExportModal(false)} 
                                    className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all active:scale-90"
                                >
                                    <ChevronLeft size={24} />
                                </button>
                                <div className="text-right">
                                    <h3 className="text-lg font-black text-white uppercase tracking-tighter italic">TAKTİK PAYLAŞ</h3>
                                    <p className="text-[10px] text-[#39FF14] font-bold uppercase tracking-widest">Maç Günü Kartı</p>
                                </div>
                            </div>
                            
                            {/* The Card to Export */}
                            <div id="match-day-card" className="w-full max-w-sm bg-[#0B2815] rounded-[40px] overflow-hidden border-4 border-[#161B22] shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative group">
                                {/* Decorative Glow */}
                                <div className="absolute -top-20 -left-20 w-40 h-40 bg-[#39FF14]/10 blur-[80px] rounded-full pointer-events-none"></div>
                                <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none"></div>

                                {/* Header */}
                                <div className="p-8 text-center border-b border-white/10 bg-black/40 relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#39FF14] to-transparent opacity-50"></div>
                                    <div className="absolute top-6 left-6 text-[9px] font-black text-white/30 tracking-[0.2em] uppercase">OFFICIAL LINEUP</div>
                                    <div className="absolute top-6 right-6 text-[9px] font-black text-white/30 tracking-[0.2em] uppercase">MATCH DAY</div>
                                    
                                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-[#39FF14] to-emerald-600 rounded-[24px] flex items-center justify-center shadow-[0_10px_30px_rgba(57,255,20,0.3)] mb-4 relative group-hover:scale-110 transition-transform duration-500">
                                        <Shield size={40} className="text-black" />
                                        <div className="absolute inset-0 rounded-[24px] border-2 border-white/20"></div>
                                    </div>
                                    
                                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic leading-none">{activeTactic.name}</h2>
                                    <div className="inline-flex items-center gap-2 mt-3 px-3 py-1 bg-[#39FF14]/10 rounded-full border border-[#39FF14]/20">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse"></div>
                                        <span className="text-[10px] text-[#39FF14] font-black uppercase tracking-widest">{activeTactic.formation} SİSTEMİ</span>
                                    </div>
                                </div>

                                {/* Pitch Area */}
                                <div className="relative w-full aspect-[3/4] bg-[#0B2815]">
                                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(0,0,0,0.2) 10%, rgba(0,0,0,0.2) 20%)' }}></div>
                                    {/* Pitch Markings (Halı Saha Style) */}
                                    <div className="absolute inset-0 pointer-events-none opacity-30">
                                        <svg viewBox="0 0 600 1000" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                                            <g stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="10" y="10" width="580" height="980" />
                                                <line x1="10" y1="500" x2="590" y2="500" />
                                                <circle cx="300" cy="500" r="80" />
                                                <circle cx="300" cy="500" r="4" fill="white" />
                                                <rect x="150" y="10" width="300" height="160" />
                                                <circle cx="300" cy="130" r="4" fill="white" />
                                                <path d="M 220 170 A 80 80 0 0 0 380 170" />
                                                <rect x="150" y="830" width="300" height="160" />
                                                <circle cx="300" cy="870" r="4" fill="white" />
                                                <path d="M 220 830 A 80 80 0 0 1 380 830" />
                                                <path d="M 10 40 A 30 30 0 0 0 40 10" />
                                                <path d="M 560 10 A 30 30 0 0 0 590 40" />
                                                <path d="M 10 960 A 30 30 0 0 1 40 990" />
                                                <path d="M 590 960 A 30 30 0 0 0 560 990" />
                                            </g>
                                        </svg>
                                    </div>
                                    
                                    {/* Players */}
                                    {activeTactic.slots.map(slot => (
                                        <div 
                                            key={slot.id}
                                            className="absolute w-12 h-12 transform -translate-x-1/2 -translate-y-1/2 z-20"
                                            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                                        >
                                            {slot.player ? (
                                                <div className={`relative w-full h-full rounded-full border-2 flex items-center justify-center shadow-[0_4px_15px_rgba(0,0,0,0.5)] ${slot.role === 'GK' ? 'bg-gradient-to-br from-orange-400 to-orange-600 border-orange-300' : 'bg-gradient-to-br from-[#1e2532] to-[#11151c] border-white/30'}`}>
                                                    <span className="text-white font-black text-sm drop-shadow-md">{slot.player.name.charAt(0)}</span>
                                                    {activeTactic.captainId === slot.player.id && (
                                                        <div className="absolute -top-2 -right-2 w-5 h-5 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full flex items-center justify-center text-black text-[10px] font-black border-2 border-[#161B22] shadow-sm">
                                                            K
                                                        </div>
                                                    )}
                                                    {slot.archetype && slot.archetype !== 'NONE' && (
                                                        <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full flex items-center justify-center text-black text-xs border-2 border-[#161B22] shadow-lg">
                                                            {ARCHETYPES[slot.archetype].icon}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className={`relative w-full h-full rounded-full border-2 border-dashed bg-black/20 ${slot.role === 'GK' ? 'border-orange-500/50' : 'border-[#39FF14]/50'}`} />
                                            )}
                                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 flex flex-col items-center pointer-events-none">
                                                {slot.player && (
                                                    <span className="text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm">
                                                        {slot.player.name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Footer */}
                                <div className="p-6 bg-black/60 border-t border-white/10">
                                    <div className="text-center mb-4">
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">OYUN KİMLİĞİ</div>
                                        <div className={`text-xl font-black italic uppercase ${
                                            activeTactic.identity === 'HIGH_PRESS' ? 'text-red-500' :
                                            activeTactic.identity === 'PARK_BUS' ? 'text-blue-500' :
                                            activeTactic.identity === 'COUNTER_ATTACK' ? 'text-yellow-500' : 'text-white'
                                        }`}>
                                            {activeTactic.identity === 'HIGH_PRESS' ? '🔥 ÖNDE BASKI' :
                                             activeTactic.identity === 'PARK_BUS' ? '🛡️ KATI SAVUNMA' :
                                             activeTactic.identity === 'COUNTER_ATTACK' ? '⚡ KONTRA ATAK' : '⚖️ DENGELİ'}
                                        </div>
                                    </div>
                                    
                                    {activeTactic.notes && (
                                        <div className="bg-white/5 p-4 rounded-xl border border-white/10 relative">
                                            <MessageSquare size={16} className="absolute top-4 left-4 text-white/20" />
                                            <p className="text-sm text-gray-300 italic pl-8 font-serif">"{activeTactic.notes}"</p>
                                        </div>
                                    )}

                                    {/* Dürüst veri: uydurma yaş/reyting satırı öldü (Spec §11) */}
                                    <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-[9px] text-gray-500 font-mono uppercase tracking-widest">
                                        <span>{activeTactic.formation} · {formatLabel(activeTactic.size)}</span>
                                        <span className="text-[#39FF14]">Powered by OYNA</span>
                                    </div>
                                </div>
                            </div>

                            <div className="w-full max-w-sm mt-8 space-y-3">
                                {/* Paylaşım GERÇEK link üretir (N92): salt-okunur oyna.app/t/{token}.
                                    Kayıtsız taslak paylaşılamaz — dürüst kural. */}
                                <button
                                    onClick={async () => {
                                        const savedId = activeTactic.id && dbTactics.find(t => t.id === activeTactic.id)
                                            ? activeTactic.id : null;
                                        if (!savedId) {
                                            showToast('Önce taktiği kaydet — linki kayıtlı taktik taşır.', 'error');
                                            return;
                                        }
                                        try {
                                            const token = await setTacticShareLink(savedId, true);
                                            if (!token) throw new Error('Link üretilemedi.');
                                            const url = tacticShareUrl(token);
                                            if (navigator.share) {
                                                await navigator.share({
                                                    title: `${activeTactic.name} — OYNA Taktik`,
                                                    text: `${activeTactic.formation} dizilişli taktiğim: ${activeTactic.name}`,
                                                    url,
                                                });
                                            } else {
                                                await navigator.clipboard.writeText(url);
                                                showToast('Paylaşım linki kopyalandı!');
                                            }
                                        } catch (e) {
                                            if ((e as Error)?.name !== 'AbortError') {
                                                showToast((e as Error)?.message || 'Paylaşılamadı.', 'error');
                                            }
                                        }
                                    }}
                                    className="w-full py-5 bg-[#39FF14] text-black font-black rounded-[24px] text-sm tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_10px_30px_rgba(57,255,20,0.3)] flex items-center justify-center gap-3"
                                >
                                    <Share2 size={20} /> LİNKLE PAYLAŞ
                                </button>

                                {/* Takım sohbetine zengin kart olarak düşer (Küme 4) */}
                                {(activeTactic.teamId || selectedTeamId) && (
                                    <button
                                        onClick={async () => {
                                            const savedId = activeTactic.id && dbTactics.find(t => t.id === activeTactic.id)
                                                ? activeTactic.id : null;
                                            const targetTeam = activeTactic.teamId || selectedTeamId;
                                            if (!savedId || !targetTeam) {
                                                showToast('Önce taktiği takıma kaydet.', 'error');
                                                return;
                                            }
                                            try {
                                                await sendTeamMessage(targetTeam,
                                                    tacticMessageBody(savedId, activeTactic.name, activeTactic.formation));
                                                showToast('Taktik takım sohbetine gönderildi 💬');
                                                setShowExportModal(false);
                                            } catch (e) {
                                                showToast((e as Error)?.message || 'Gönderilemedi.', 'error');
                                            }
                                        }}
                                        className="w-full py-4 bg-white/8 border border-white/12 text-white font-black rounded-[20px] text-xs tracking-widest uppercase hover:bg-white/12 transition-all flex items-center justify-center gap-2"
                                    >
                                        <MessageSquare size={16} className="text-[#39FF14]" /> TAKIM SOHBETİNE GÖNDER
                                    </button>
                                )}

                                <button
                                    onClick={() => setShowExportModal(false)}
                                    className="w-full py-4 bg-white/5 text-white/60 font-bold rounded-[20px] text-xs tracking-widest uppercase hover:bg-white/10 transition-all"
                                >
                                    VAZGEÇ
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Tactics Modal */}
            <AnimatePresence>
                {showTacticsModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/90 backdrop-blur-md z-[70] flex items-center justify-center p-6"
                        onClick={() => setShowTacticsModal(false)}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-[#161B22] border border-white/10 rounded-[32px] w-full max-w-lg overflow-hidden shadow-[0_0_60px_rgba(57,255,20,0.1)] flex flex-col max-h-[80vh]"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#0A0E14]/50">
                                <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                                    <List size={24} className="text-[#39FF14]" /> KAYITLI TAKTİKLER
                                </h3>
                                <button onClick={() => setShowTacticsModal(false)} className="p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full"><X size={20} /></button>
                            </div>
                            <div className="p-4 overflow-y-auto flex-1 space-y-3 no-scrollbar">
                                {dbTactics.length === 0 ? (
                                    <div className="py-12 text-center text-gray-500 font-mono text-sm">
                                        Henüz kaydedilmiş bir taktik yok.
                                    </div>
                                ) : (
                                    dbTactics.map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => {
                                                const existingIndex = plans.findIndex(p => p.id === t.id);
                                                if (existingIndex >= 0) {
                                                    setActivePlanIndex(existingIndex);
                                                } else {
                                                    setPlans([...plans, t]);
                                                    setActivePlanIndex(plans.length);
                                                }
                                                setShowTacticsModal(false);
                                            }}
                                            className="w-full text-left p-4 rounded-2xl border border-white/5 bg-[#0A0E14]/30 hover:bg-[#39FF14]/10 hover:border-[#39FF14]/30 transition-all group flex items-center justify-between"
                                        >
                                            <div>
                                                <h4 className="text-white font-bold text-lg group-hover:text-[#39FF14] transition-colors">{t.name}</h4>
                                                <div className="text-[10px] font-mono text-gray-500 flex items-center gap-2 mt-1 uppercase">
                                                    <span>{t.teamName || 'İSİMSİZ TAKIM'}</span>
                                                    <span>•</span>
                                                    <span>{t.formation}</span>
                                                    <span>•</span>
                                                    <span>{t.size}</span>
                                                </div>
                                            </div>
                                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[#39FF14] group-hover:text-black transition-colors text-white/50">
                                                <ChevronRight size={18} />
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Save Modal */}
            <AnimatePresence>
                {showSaveModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/90 backdrop-blur-md z-[70] flex items-center justify-center p-6"
                        onClick={() => setShowSaveModal(false)}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-[#161B22] border border-white/10 rounded-[32px] w-full max-w-sm overflow-hidden shadow-[0_0_60px_rgba(57,255,20,0.1)] p-6"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
                                    <Save size={20} className="text-[#39FF14]" /> TAKTİĞİ KAYDET
                                </h3>
                                <button onClick={() => setShowSaveModal(false)} className="p-2 text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
                            </div>
                            
                            <div className="space-y-4 mb-8">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-2">Taktik İsmi</label>
                                    <input
                                        type="text"
                                        value={saveTacticName}
                                        onChange={(e) => setSaveTacticName(e.target.value)}
                                        placeholder="Bu taktiğin adı ne olsun?"
                                        className="w-full bg-[#0A0E14] border border-white/10 rounded-2xl px-5 py-4 text-sm text-white placeholder-gray-600 focus:border-[#39FF14] outline-none transition-colors"
                                    />
                                </div>
                                {/* Hedef bağlam: status sunucuda belirlenir — dürüst önizleme */}
                                <div className="bg-[#0A0E14] border border-white/10 rounded-2xl px-5 py-4 text-xs">
                                    {(() => {
                                        const teamRow = studioTeams.find(t => t.team_id === selectedTeamId);
                                        if (!teamRow) {
                                            return <span className="text-gray-400">📁 <b className="text-white">Kişisel kütüphanene</b> kaydedilir.</span>;
                                        }
                                        const admin = teamRow.my_role === 'CAPTAIN' || teamRow.my_role === 'ADMIN';
                                        return admin
                                            ? <span className="text-gray-400">🛡️ <b className="text-white">{teamRow.name}</b> oyun defterine <b className="text-[#39FF14]">onaylı</b> kaydedilir.</span>
                                            : <span className="text-gray-400">🛡️ <b className="text-white">{teamRow.name}</b> yöneticilerine <b className="text-amber-400">öneri</b> olarak gönderilir.</span>;
                                    })()}
                                </div>
                            </div>

                            <button
                                onClick={handleSaveTactic}
                                disabled={!saveTacticName.trim()}
                                className="w-full h-14 bg-[#39FF14] text-black font-black text-xs tracking-widest uppercase rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(57,255,20,0.2)]"
                            >
                                {(() => {
                                    const teamRow = studioTeams.find(t => t.team_id === selectedTeamId);
                                    if (!teamRow) return "KAYDET";
                                    const admin = teamRow.my_role === 'CAPTAIN' || teamRow.my_role === 'ADMIN';
                                    return admin ? "KAYDET" : "TAKIMA ÖNER";
                                })()}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Reset Confirm Modal */}
            <AnimatePresence>
                {showResetConfirmModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/90 backdrop-blur-md z-[70] flex items-center justify-center p-6"
                        onClick={() => setShowResetConfirmModal(false)}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-[#161B22] border border-red-500/30 rounded-[32px] w-full max-w-sm overflow-hidden shadow-[0_0_60px_rgba(239,68,68,0.1)] p-6 text-center"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                                <RotateCw size={24} />
                            </div>
                            <h3 className="text-xl font-black text-white uppercase tracking-widest mb-2">
                                SAYFAYI YENİLE
                            </h3>
                            <p className="text-gray-400 text-sm mb-6">
                                Sayfa yenilenecektir. Eğer güncel taktikleri kaydetmediyseniz hepsi <strong className="text-red-400">YOK OLACAKTIR</strong>. Devam etmek istiyor musunuz?
                            </p>
                            
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setShowResetConfirmModal(false)}
                                    className="flex-1 py-4 bg-white/5 border border-white/10 text-white font-bold text-xs tracking-widest rounded-2xl hover:bg-white/10 transition-colors"
                                >
                                    İPTAL
                                </button>
                                <button 
                                    onClick={handleReset}
                                    className="flex-1 py-4 bg-red-500 text-white font-bold text-xs tracking-widest rounded-2xl bg-gradient-to-r hover:from-red-600 hover:to-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all"
                                >
                                    YENİLE
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </motion.div>
    )}
</AnimatePresence>

{/* Öneri karar çubuğu — bekleyen takım taktiği + yönetici (M87) */}
            <AnimatePresence>
                {canDecideProposal && viewMode === 'STUDIO' && (
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[90] w-[calc(100%-2.5rem)] max-w-md rounded-3xl bg-[#161B22] border border-amber-400/30 shadow-[0_8px_40px_rgba(0,0,0,0.6)] p-4"
                    >
                        <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">
                            Onay Bekleyen Öneri
                        </div>
                        <p className="text-xs text-white/60 mb-3">
                            "{activeTactic.name}" takım taktiği olarak önerildi. İncele ve karar ver.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => decideProposal(false)}
                                disabled={decidingProposal}
                                className="flex-1 min-h-[44px] rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-white/70 active:scale-[0.97] disabled:opacity-50"
                            >
                                Reddet
                            </button>
                            <button
                                onClick={() => decideProposal(true)}
                                disabled={decidingProposal}
                                className="flex-1 min-h-[44px] rounded-2xl bg-[#39FF14] text-[#0A0E14] text-sm font-black active:scale-[0.97] disabled:opacity-50"
                            >
                                {decidingProposal ? '…' : 'Onayla'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

{/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div 
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[280px]"
                        style={{ 
                            backgroundColor: toast.type === 'success' ? '#10B981' : '#EF4444',
                            color: 'white'
                        }}
                    >
                        {toast.type === 'success' ? <UserCheck size={20} /> : <ShieldAlert size={20} />}
                        <span className="text-sm font-bold">{toast.message}</span>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default Studio;
