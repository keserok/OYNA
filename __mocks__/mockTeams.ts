// Dev modu (IS_LOCAL_DEV) takım mock'ları — prod build'de store'a yüklenmez.
import { Team } from '../types';

export const MOCK_TEAMS: Team[] = [
  {
    id: 't1', name: 'Boğaziçi Kaplanları', shortName: 'BĞZ', location: 'Hisarüstü, İstanbul',
    color1: '#10B981', color2: '#064E3B', crest: 'shield', players: ['1', '6', '11'],
    roster: [
      { id: '1', name: 'Caner Kaya', avatar: 'https://i.pravatar.cc/150?u=caner', rating: 4.6, position: 'FWD', x: 50, y: 15 },
      { id: '6', name: 'Burak Şahin', avatar: 'https://i.pravatar.cc/150?u=burak', rating: 4.3, position: 'CM', x: 50, y: 50 },
      { id: '11', name: 'Hakan Çelik', avatar: 'https://i.pravatar.cc/150?u=hakan', rating: 4.1, position: 'CB', x: 50, y: 80 },
    ],
    logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=bgz&backgroundColor=10B981',
    captain: '1', teamValue: '75000', wins: 14, losses: 3, colors: ['#10B981', '#064E3B'], playStyle: 'Tiki-Taka',
  },
  {
    id: 't2', name: 'Karaköy Athletics', shortName: 'KRK', location: 'Karaköy, İstanbul',
    color1: '#FF5722', color2: '#000000', crest: 'sword', players: ['4', '8', '15'],
    roster: [
      { id: '4', name: 'Ahmet Yılmaz', avatar: 'https://i.pravatar.cc/150?u=ahmet', rating: 4.4, position: 'FWD', x: 50, y: 15 },
      { id: '8', name: 'Ozan Tekin', avatar: 'https://i.pravatar.cc/150?u=ozan', rating: 4.2, position: 'CM', x: 50, y: 50 },
      { id: '15', name: 'Deniz Sarp', avatar: 'https://i.pravatar.cc/150?u=deniz', rating: 4.0, position: 'CB', x: 50, y: 80 },
    ],
    logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=krk&backgroundColor=FF5722',
    captain: '4', teamValue: '85000', wins: 22, losses: 8, colors: ['#FF5722', '#000000'], playStyle: 'Kontra Atak',
  },
  {
    id: 't3', name: 'Moda United', shortName: 'MOD', location: 'Kadıköy, İstanbul',
    color1: '#800000', color2: '#FFD700', crest: 'crown', players: ['2', '7', '14'],
    roster: [
      { id: '2', name: 'Emre Demir', avatar: 'https://i.pravatar.cc/150?u=emre', rating: 4.5, position: 'FWD', x: 50, y: 15 },
      { id: '7', name: 'Kaan Gök', avatar: 'https://i.pravatar.cc/150?u=kaan', rating: 4.1, position: 'CM', x: 50, y: 50 },
      { id: '14', name: 'Yusuf Can', avatar: 'https://i.pravatar.cc/150?u=yusuf', rating: 3.9, position: 'CB', x: 50, y: 80 },
    ],
    logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=mod&backgroundColor=800000',
    captain: '2', teamValue: '62000', wins: 15, losses: 10, colors: ['#800000', '#FFD700'], playStyle: 'Baskılı Oyun',
  },
  {
    id: 't4', name: 'Maslak City FC', shortName: 'MSL', location: 'Sarıyer, İstanbul',
    color1: '#00BCD4', color2: '#0A0E14', crest: 'lightning', players: ['3', '9', '10'],
    roster: [
      { id: '3', name: 'Mert Arslan', avatar: 'https://i.pravatar.cc/150?u=mert', rating: 4.7, position: 'FWD', x: 50, y: 15 },
      { id: '9', name: 'Efe Korkmaz', avatar: 'https://i.pravatar.cc/150?u=efe', rating: 4.4, position: 'CM', x: 50, y: 50 },
      { id: '10', name: 'Sinan Gül', avatar: 'https://i.pravatar.cc/150?u=sinan', rating: 4.2, position: 'CB', x: 50, y: 80 },
    ],
    logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=msl&backgroundColor=00BCD4',
    captain: '3', teamValue: '95000', wins: 30, losses: 5, colors: ['#00BCD4', '#0A0E14'], playStyle: 'Topa Sahip Ol',
  },
] as unknown as Team[];
