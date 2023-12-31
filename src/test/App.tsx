import { InfiniteGallery } from '@/lib/components/InfiniteGallery'
import { type PhotosChunk } from '@/lib/components/InfiniteGallery/components/Main';
import { testData } from './testData';

function App() {
  async function getNextPhotosChunk(offset: number, limit: number): Promise<PhotosChunk> {
    const photos = testData.slice(offset, offset + limit);

    return {
      totalCount: testData.length,
      photos: photos
    };
  }

  return (
    <FullScreenTestWrapper>
      <InfiniteGallery
        getNextPhotosChunk={getNextPhotosChunk}
        paddingLeft={2} paddingRight={2} paddingTop={2} paddingBottom={2}
        gap={10}
      />
    </FullScreenTestWrapper>
  );
}

function FullScreenTestWrapper(props: React.PropsWithChildren) {
  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: 'red', display: 'flex' }}>
      <div style={{ width: 'calc(100%)', height: 'calc(100% - 20px)', backgroundColor: 'yellow', margin: '10px' }}>
        {props.children}
        {/* <div style={{ width: '100%', height: '100%', backgroundColor: 'blue' }} /> */}
      </div>
    </div>
  );
}

export default App
