export const CANVAS_W = 800;
export const CANVAS_H = 1000;

export const garmentTypes = [
  { id: 'tshirt', name: 'T-Shirt' },
  { id: 'longsleeve', name: 'Longsleeve' },
];

export const colors = [
  { id: 'white', name: 'White', hex: '#f4f2ed' },
  { id: 'sand', name: 'Sand', hex: '#d8cdbc' },
  { id: 'bottle-green', name: 'Bottle Green', hex: '#2d4a3a' },
  { id: 'black', name: 'Black', hex: '#1a1a1a' },
];

const TSHIRT_FRONT = 'M 240 130 L 345 110 Q 400 175 455 110 L 560 130 L 680 330 L 555 360 L 580 890 L 220 890 L 245 360 L 120 330 Z';
const TSHIRT_BACK  = 'M 240 130 L 345 110 Q 400 135 455 110 L 560 130 L 680 330 L 555 360 L 580 890 L 220 890 L 245 360 L 120 330 Z';

const LS_FRONT = 'M 240 130 L 345 110 Q 400 175 455 110 L 560 130 L 700 800 L 615 815 L 545 370 L 580 890 L 220 890 L 255 370 L 185 815 L 100 800 Z';
const LS_BACK  = 'M 240 130 L 345 110 Q 400 135 455 110 L 560 130 L 700 800 L 615 815 L 545 370 L 580 890 L 220 890 L 255 370 L 185 815 L 100 800 Z';

export const garments = {
  tshirt: {
    name: 'T-Shirt',
    front: { path: TSHIRT_FRONT, design: { x: 0.5, y: 0.36, w: 0.28 } },
    back:  { path: TSHIRT_BACK,  design: { x: 0.5, y: 0.34, w: 0.42 } },
  },
  longsleeve: {
    name: 'Longsleeve',
    front: { path: LS_FRONT, design: { x: 0.5, y: 0.36, w: 0.28 } },
    back:  { path: LS_BACK,  design: { x: 0.5, y: 0.34, w: 0.42 } },
  },
};
