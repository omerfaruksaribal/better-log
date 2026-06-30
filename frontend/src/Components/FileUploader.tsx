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
      restrictions: { allowedFileTypes: ['.json', '.ndjson'] },
      autoProceed: false,
    });

    uppyInstance.use(XHRUpload, {
      endpoint: 'http://localhost:3000/upload',
      fieldName: 'files',
      bundle: false,
      limit: 1,
      timeout: 0,
      headers: { accept: 'application/json' },
    });

    return uppyInstance;
  });

  useEffect(() => {
    const successHandler = (file: any, response: any) => {
      console.log('Uploaded:', file?.name, response);
    };
    const errorHandler = (file: any, response: any) => {
      console.log('Upload error:', file?.name, response);
    };
    const completeHandler = (result: any) => {
      if (result.successful.length > 0) onUploadComplete();
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
    <Dashboard
      uppy={uppy}
      theme="dark"
      height={260}
      width="100%"
      note="Drag a log folder here · .json / .ndjson"
      proudlyDisplayPoweredByUppy={false}
      showLinkToFileUploadResult={false}
      showRemoveButtonAfterComplete={true}
    />
  );
};

export default FileUploader;
