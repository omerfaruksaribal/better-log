import { useEffect, useState } from 'react';
import { Uppy } from '@uppy/core';
import Dashboard from '@uppy/react/dashboard';
import XHRUpload from '@uppy/xhr-upload';

import '@uppy/core/css/style.min.css';
import '@uppy/dashboard/css/style.min.css';

interface FileUploaderProps {
  onUploadComplete: () => void;
}

const FileUploader = ({ onUploadComplete }: FileUploaderProps) => {
  const [uppy] = useState(() => {
    const uppyInstance = new Uppy({
      id: 'File-Uploader',
      restrictions: {
        allowedFileTypes: ['.json', '.ndjson'],
      },
      autoProceed: false,
    });

    uppyInstance.use(XHRUpload, {
      endpoint: 'http://localhost:3000/upload',
      fieldName: 'files',
      bundle: false,
      limit: 1, // to prevent network crash
      timeout: 0, // 0 is infinite
      headers: {
        accept: 'application/json',
      },
    });

    return uppyInstance;
  });

  useEffect(() => {
    const successHandler = (file: any, response: any) => {
      console.log('File uploaded successfully: ', file?.name);
      console.log('Server response: ', response);
    };

    const errorHandler = (file: any, response: any) => {
      console.log('File could not uploaded: ', file?.name);
      console.log('Server response: ', response);
    };

    const completeHandler = (result: any) => {
      console.log('Upload complete, files: ', result.successfull);
      if (result.successful.length > 0) {
        onUploadComplete(); // we are telling to the App.tsx (higher component) to refresh the page -> logtable
      }
    };

    uppy.on('upload-success', successHandler);
    uppy.on('upload-error', errorHandler);
    uppy.on('complete', completeHandler);

    return () => {
      uppy.off('upload-success', successHandler);
      uppy.off('upload-error', errorHandler);
      uppy.off('complete', completeHandler);
    };
  }, [uppy, onUploadComplete]);

  return (
    <div style={{ marginBottom: '20px' }}>
      <Dashboard
        uppy={uppy}
        height={300}
        width="100%"
        note="Accepted file types: .json, .ndjson"
        proudlyDisplayPoweredByUppy={false}
        showLinkToFileUploadResult={false}
        showRemoveButtonAfterComplete={true}
      />
    </div>
  );
};

export default FileUploader;
