import { Apple, Bed, Bike, BookOpen, Brain, Code, Droplet, Dumbbell, Footprints, Heart, Languages, Leaf, Moon, Music, PenLine, Pill } from 'lucide-react';
import type { NewHabit } from '../../db/habits';

/** The icons a habit can have, by the key stored in `Habit.icon`. */
export const HABIT_ICONS: Record<string, { icon: typeof Droplet; label: string }> = {
  water: { icon: Droplet, label: 'Água' },
  gym: { icon: Dumbbell, label: 'Academia' },
  book: { icon: BookOpen, label: 'Leitura' },
  pen: { icon: PenLine, label: 'Estudo' },
  run: { icon: Footprints, label: 'Caminhada' },
  bike: { icon: Bike, label: 'Bicicleta' },
  leaf: { icon: Leaf, label: 'Meditação' },
  moon: { icon: Moon, label: 'Sono' },
  bed: { icon: Bed, label: 'Descanso' },
  heart: { icon: Heart, label: 'Saúde' },
  apple: { icon: Apple, label: 'Alimentação' },
  pill: { icon: Pill, label: 'Remédio' },
  brain: { icon: Brain, label: 'Mente' },
  music: { icon: Music, label: 'Música' },
  code: { icon: Code, label: 'Programação' },
  languages: { icon: Languages, label: 'Idiomas' },
};

export const habitIcon = (key: string) => (HABIT_ICONS[key] ?? HABIT_ICONS.heart).icon;

/** Habit colors (the first ones are the templates'); any other comes from the color picker. */
export const HABIT_COLORS = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#0d9488', '#4f46e5', '#db2777', '#ca8a04', '#dc2626', '#0284c7'];

const WEEKDAYS = [1, 2, 3, 4, 5];

/** Ready-made habits for the empty routine. */
export const TEMPLATES: (NewHabit & { detail: string })[] = [
  { name: 'Água', icon: 'water', color: '#2563eb', kind: 'count', goal: 2000, unit: 'ml', amounts: [200, 300, 500], detail: '2 L por dia · copo, caneca, garrafa' },
  { name: 'Academia', icon: 'gym', color: '#ea580c', kind: 'check', goal: 1, days: WEEKDAYS, holidaysOff: true, detail: 'seg a sex · feriado é folga' },
  { name: 'Leitura', icon: 'book', color: '#16a34a', kind: 'time', goal: 30, auto: 'reading', detail: '30 min · conta sozinho nos livros' },
  { name: 'Estudo', icon: 'pen', color: '#9333ea', kind: 'time', goal: 120, auto: 'study', days: WEEKDAYS, holidaysOff: true, detail: '2 h, seg a sex · conta sozinho nos cadernos' },
  { name: 'Meditação', icon: 'leaf', color: '#0d9488', kind: 'time', goal: 10, detail: '10 min por dia' },
  { name: 'Dormir cedo', icon: 'moon', color: '#4f46e5', kind: 'check', goal: 1, detail: 'antes das 23h · feito ou não' },
];
