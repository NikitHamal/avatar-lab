export type CreatureShape = 'dot' | 'circle' | 'cat' | 'acorn'
export type CreatureShapeKey = 'neutral_a' | 'neutral_b' | 'neutral_c' | 'neutral_d'

export const SHAPE_MAP: Record<CreatureShape, CreatureShapeKey> = {
  dot: 'neutral_a',
  circle: 'neutral_b',
  cat: 'neutral_c',
  acorn: 'neutral_d',
}

export const SHAPE_NAMES: Record<CreatureShapeKey, CreatureShape> = {
  neutral_a: 'dot',
  neutral_b: 'circle',
  neutral_c: 'cat',
  neutral_d: 'acorn',
}

export type CreatureColorway = {
  index: number
  id: string
  name: string
  body: string
  eyes: string
  pupil?: string
}

export const CREATURE_COLORWAYS: CreatureColorway[] = [
  { index: 0, id: 'og', name: 'OG', body: '#FFFFFF', eyes: '#000000' },
  { index: 1, id: 'static', name: 'Static', body: '#666666', eyes: '#000000', pupil: '#FFFFFF' },
  { index: 2, id: 'eraser', name: 'Eraser', body: '#666666', eyes: '#FFEDED', pupil: '#000000' },
  { index: 3, id: 'cherry', name: 'Cherry', body: '#AE0002', eyes: '#FF5252' },
  { index: 4, id: 'lobster', name: 'Lobster', body: '#F95320', eyes: '#044A5F' },
  { index: 5, id: 'pinball', name: 'Pinball', body: '#B60207', eyes: '#D2F9F9', pupil: '#60D105' },
  { index: 6, id: 'siren', name: 'Siren', body: '#FD0C0D', eyes: '#2905E6' },
  { index: 7, id: 'gumball', name: 'Gumball', body: '#F20F07', eyes: '#FFFFFF' },
  { index: 8, id: 'ladybug', name: 'Ladybug', body: '#C3110E', eyes: '#000000' },
  { index: 9, id: 'jam', name: 'Jam', body: '#C5013C', eyes: '#09CE93' },
  { index: 10, id: 'strawberry', name: 'Strawberry', body: '#FCB7F2', eyes: '#069A1E' },
  { index: 11, id: 'slushie', name: 'Slushie', body: '#C206AD', eyes: '#49F6D9' },
  { index: 12, id: 'lipgloss', name: 'Lipgloss', body: '#A10180', eyes: '#FC609C' },
  { index: 13, id: 'jawbreaker', name: 'Jawbreaker', body: '#F6759F', eyes: '#56031F' },
  { index: 14, id: 'valentine', name: 'Valentine', body: '#DD06CB', eyes: '#7B1612' },
  { index: 15, id: 'moth', name: 'Moth', body: '#EC75F6', eyes: '#564803' },
  { index: 16, id: 'crocus', name: 'Crocus', body: '#D602E8', eyes: '#FBF823' },
  { index: 17, id: 'eggplant', name: 'Eggplant', body: '#E202E8', eyes: '#0A0A0A' },
  { index: 18, id: 'glowworm', name: 'Glowworm', body: '#F40DF8', eyes: '#19F515' },
  { index: 19, id: 'taffy', name: 'Taffy', body: '#F474DC', eyes: '#E8FCA6' },
  { index: 20, id: 'bubblegum', name: 'Bubblegum', body: '#F442E7', eyes: '#FFFFFF' },
  { index: 21, id: 'socks', name: 'Socks', body: '#B865A8', eyes: '#76D8EB', pupil: '#8F1716' },
  { index: 22, id: 'petunia', name: 'Petunia', body: '#F8AFFB', eyes: '#F006B4' },
  { index: 23, id: 'motel', name: 'Motel', body: '#FA486F', eyes: '#92FABE' },
  { index: 24, id: 'koi', name: 'Koi', body: '#FE6873', eyes: '#0A0A0A', pupil: '#D0F910' },
  { index: 25, id: 'juicebox', name: 'Juicebox', body: '#F6826C', eyes: '#95059B' },
  { index: 26, id: 'marble', name: 'Marble', body: '#D1D9FA', eyes: '#C11207', pupil: '#D20ADF' },
  { index: 27, id: 'seashell', name: 'Seashell', body: '#FCD9CF', eyes: '#070571' },
  { index: 28, id: 'cupcake', name: 'Cupcake', body: '#F9FFB2', eyes: '#CA00CA' },
  { index: 29, id: 'flamingo', name: 'Flamingo', body: '#FCB7C3', eyes: '#068F9A' },
  { index: 30, id: 'postcard', name: 'Postcard', body: '#BE6A6A', eyes: '#76D8EB' },
  { index: 31, id: 'hydrangea', name: 'Hydrangea', body: '#E1BFE1', eyes: '#2722DB' },
  { index: 32, id: 'plum', name: 'Plum', body: '#7260E6', eyes: '#622058' },
  { index: 33, id: 'denim', name: 'Denim', body: '#6C92F8', eyes: '#102A6E' },
  { index: 34, id: 'starboy', name: 'Starboy', body: '#7B43F5', eyes: '#F6BD49' },
  { index: 35, id: 'nightlight', name: 'Nightlight', body: '#7768FE', eyes: '#55FC87' },
  { index: 36, id: 'puddle', name: 'Puddle', body: '#A7AFF6', eyes: '#837605' },
  { index: 37, id: 'robin', name: 'Robin', body: '#15ABF8', eyes: '#5E2304' },
  { index: 38, id: 'pool', name: 'Pool', body: '#05A8F9', eyes: '#FCEEEE' },
  { index: 39, id: 'submarine', name: 'Submarine', body: '#0F7BA9', eyes: '#000000' },
  { index: 40, id: 'buoy', name: 'Buoy', body: '#14ABD6', eyes: '#EEFA24' },
  {
    index: 41,
    id: 'stoplight',
    name: 'Stoplight',
    body: '#34F7FD',
    eyes: '#038C03',
    pupil: '#F91024',
  },
  { index: 42, id: 'terrarium', name: 'Terrarium', body: '#6FF5D0', eyes: '#106E54' },
  { index: 43, id: 'spearmint', name: 'Spearmint', body: '#9CFBCE', eyes: '#790572' },
  { index: 44, id: 'peacock', name: 'Peacock', body: '#02B0B6', eyes: '#7923FB' },
  { index: 45, id: 'sprinkler', name: 'Sprinkler', body: '#59BF05', eyes: '#FFFFFF' },
  { index: 46, id: 'frog', name: 'Frog', body: '#42DE86', eyes: '#436A16' },
  { index: 47, id: 'chamomile', name: 'Chamomile', body: '#509156', eyes: '#F4C524' },
  { index: 48, id: 'parakeet', name: 'Parakeet', body: '#018335', eyes: '#23FAFB' },
  { index: 49, id: 'popsicle', name: 'Popsicle', body: '#71FEAE', eyes: '#5598FC' },
  { index: 50, id: 'houseplant', name: 'Houseplant', body: '#039442', eyes: '#71FF6F' },
  { index: 51, id: 'flytrap', name: 'Flytrap', body: '#15F817', eyes: '#5E045E' },
  { index: 52, id: 'seaglass', name: 'Seaglass', body: '#FBFBFB', eyes: '#167B61' },
  { index: 53, id: 'guava', name: 'Guava', body: '#84FB8E', eyes: '#F64982' },
  { index: 54, id: 'avocado', name: 'Avocado', body: '#8BD67C', eyes: '#230606' },
  { index: 55, id: 'kiwi', name: 'Kiwi', body: '#55F927', eyes: '#9F7717' },
  { index: 56, id: 'tomato', name: 'Tomato', body: '#60A611', eyes: '#B4040F' },
  { index: 57, id: 'mallard', name: 'Mallard', body: '#7B8401', eyes: '#0737A7' },
  { index: 58, id: 'junebug', name: 'Junebug', body: '#14DA70', eyes: '#3516AF' },
  { index: 59, id: 'highlighter', name: 'Highlighter', body: '#95F124', eyes: '#F50DCF' },
  {
    index: 60,
    id: 'bumblebee',
    name: 'Bumblebee',
    body: '#FDCB21',
    eyes: '#0A0A0A',
    pupil: '#D10566',
  },
  { index: 61, id: 'glowstick', name: 'Glowstick', body: '#E9F905', eyes: '#360342' },
  { index: 62, id: 'beachball', name: 'Beachball', body: '#F6FD21', eyes: '#1C9DE3' },
  { index: 63, id: 'lilypad', name: 'Lilypad', body: '#D1F63B', eyes: '#10812B', pupil: '#0F91F4' },
  { index: 64, id: 'pumpkin', name: 'Pumpkin', body: '#E87102', eyes: '#55FC6E' },
  { index: 65, id: 'cactus', name: 'Cactus', body: '#C4F41D', eyes: '#530AEC' },
  { index: 66, id: 'popcorn', name: 'Popcorn', body: '#EAF66E', eyes: '#BB240A', pupil: '#0964E7' },
  { index: 67, id: 'spumoni', name: 'Spumoni', body: '#F6EAB9', eyes: '#177E39', pupil: '#2722DB' },
  { index: 68, id: 'marmalade', name: 'Marmalade', body: '#F99F05', eyes: '#6E6123' },
  { index: 69, id: 'goldfish', name: 'Goldfish', body: '#E0F4FB', eyes: '#DE9109' },
  { index: 70, id: 'sandbox', name: 'Sandbox', body: '#B8804A', eyes: '#F7F574' },
  { index: 71, id: 'candle', name: 'Candle', body: '#973849', eyes: '#F7FBBC' },
  { index: 72, id: 'calculator', name: 'Calculator', body: '#737373', eyes: '#09E151' },
  {
    index: 73,
    id: 'umbrella',
    name: 'Umbrella',
    body: '#E7E3E9',
    eyes: '#F65F28',
    pupil: '#4F6BF8',
  },
  { index: 74, id: 'doorbell', name: 'Doorbell', body: '#BEBEBE', eyes: '#E42D06' },
  { index: 75, id: 'candycane', name: 'Candycane', body: '#9CFBD5', eyes: '#790C05' },
  { index: 76, id: 'kite', name: 'Kite', body: '#7DB5F4', eyes: '#C10787' },
  { index: 77, id: 'matcha', name: 'Matcha', body: '#C7FBA6', eyes: '#5E6E06' },
  { index: 78, id: 'flowerpot', name: 'Flowerpot', body: '#CC6262', eyes: '#3E4002' },
  { index: 79, id: 'teacup', name: 'Teacup', body: '#F6E5A5', eyes: '#0D73F7' },
  { index: 80, id: 'sherbet', name: 'Sherbet', body: '#E4F4E2', eyes: '#4A0A99', pupil: '#DB8405' },
  { index: 81, id: 'peach', name: 'Peach', body: '#FDFBE2', eyes: '#F76E5D' },
  { index: 82, id: 'smoothie', name: 'Smoothie', body: '#FFECE0', eyes: '#CE0959' },
  { index: 83, id: 'limeade', name: 'Limeade', body: '#EAFCC5', eyes: '#09B6CE' },
  { index: 84, id: 'laser', name: 'Laser', body: '#FFFFFF', eyes: '#FF0000' },
  { index: 85, id: 'snowball', name: 'Snowball', body: '#FFFFFF', eyes: '#5A79F3' },
  { index: 86, id: 'pebble', name: 'Pebble', body: '#645252', eyes: '#A4A4A4' },
  { index: 87, id: 'dragonfruit', name: 'Dragonfruit', body: '#B60053', eyes: '#CFFA0F' },
  { index: 88, id: 'sunset', name: 'Sunset', body: '#AE2400', eyes: '#F855FC' },
  { index: 89, id: 'hibiscus', name: 'Hibiscus', body: '#B6003C', eyes: '#05E605' },
  { index: 90, id: 'jelly', name: 'Jelly', body: '#B60080', eyes: '#429EFB' },
  { index: 91, id: 'whale', name: 'Whale', body: '#0059A3', eyes: '#0095FF' },
  { index: 92, id: 'jukebox', name: 'Jukebox', body: '#024BDE', eyes: '#FB4CC3' },
  { index: 93, id: 'moon', name: 'Moon', body: '#4028FF', eyes: '#EBFFFC' },
  { index: 94, id: 'lilac', name: 'Lilac', body: '#7202FC', eyes: '#FDB0CE' },
  { index: 95, id: 'blacklight', name: 'Blacklight', body: '#6922F0', eyes: '#A3F410' },
  { index: 96, id: 'rosebush', name: 'Rosebush', body: '#1E6935', eyes: '#FC7AC0' },
  {
    index: 97,
    id: 'neapolitan',
    name: 'Neapolitan',
    body: '#87493B',
    eyes: '#EB76DD',
    pupil: '#B7ABF3',
  },
  { index: 98, id: 'ember', name: 'Ember', body: '#994400', eyes: '#00EEFF' },
  { index: 99, id: 'sonar', name: 'Sonar', body: '#126487', eyes: '#2EE605' },
]

// The human-readable colorway order is intentionally independent of the
// palette order baked into the Creature WASM asset. Keep the UI on the
// logical indices above and translate only at the WASM boundary.
export const CREATURE_WASM_PALETTE_INDEX = [
  35, 86, 87, 10, 36, 88, 63, 14, 31, 69, 84, 62, 8, 9, 12, 83, 55, 34, 58, 52, 18, 89, 7, 60, 90,
  75, 91, 25, 27, 85, 73, 26, 13, 6, 48, 54, 82, 46, 16, 33, 61, 92, 3, 59, 79, 15, 5, 78, 57, 66,
  2, 43, 19, 50, 32, 42, 77, 76, 44, 41, 93, 39, 38, 94, 37, 40, 95, 96, 0, 24, 80, 70, 71, 97, 72,
  30, 81, 1, 74, 29, 98, 23, 22, 28, 20, 21, 11, 67, 45, 68, 65, 4, 47, 17, 53, 51, 56, 99, 64, 49,
] as const

export function creatureWasmPaletteIndex(index: number): number {
  const normalized = Math.min(CREATURE_COLORWAYS.length - 1, Math.max(0, Math.round(index)))
  return CREATURE_WASM_PALETTE_INDEX[normalized] ?? CREATURE_WASM_PALETTE_INDEX[52]
}
