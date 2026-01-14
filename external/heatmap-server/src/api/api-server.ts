import path from 'path';

export const PORT = Number(process.env.PORT || 3002);
export const BINARY_FILE_PATH = path.resolve(__dirname, '..', '..', 'sst.grid');
export const EMPTY_MAP_IMAGE_PATH = path.resolve(__dirname, '..', '..', 'empty-map.jpg');

export const EMPTY_IMAGE_WIDTH = 3600;
export const EMPTY_IMAGE_HEIGHT = 1800;

export const DIMENSION_X = 36000;
export const DIMENSION_Y = 17999;