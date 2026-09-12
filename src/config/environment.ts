// This is fixed when building. Changing the URL cannot change the data environment.
export const IS_TEST_ENVIRONMENT = import.meta.env.VITE_APP_ENVIRONMENT !== 'production';
export const TEST_OWNER_UID = 'K7BLiJFIglcCY7XiMqQxfZ2dTRx1';
export const PRODUCTION_APP_URL = 'https://bmx-race-app.vercel.app';
export const TEST_APP_URL = '';
export const LOCAL_STORAGE_PREFIX = IS_TEST_ENVIRONMENT ? 'bmx_test:' : '';
export const DATABASE_NAME = IS_TEST_ENVIRONMENT ? 'BMXDB-test' : 'BMXDB';
export const MANAGER_COLLECTION = IS_TEST_ENVIRONMENT ? 'bmxRaceTest' : 'bmxRaceManager';
export const LIVE_COLLECTION = IS_TEST_ENVIRONMENT ? 'bmxRaceTestLive' : 'bmxRacePublic';
export const canEnterEnvironment = (uid: string) => !IS_TEST_ENVIRONMENT || uid === TEST_OWNER_UID;
