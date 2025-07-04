import React from "react";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import axios from "axios";
import { useInvalidateAvailableProducts } from "~/queries/products";

type CSVFileImportProps = {
  url: string;
  title: string;
};

export default function CSVFileImport({ url, title }: CSVFileImportProps) {
  const [file, setFile] = React.useState<File>();
  const invalidateAvailableProducts = useInvalidateAvailableProducts();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setFile(file);
    }
  };

  const removeFile = () => {
    setFile(undefined);
  };

  const uploadFile = async () => {
    if (!file) {
      console.error("No file selected for upload");
      return;
    }

    if (!url) {
      console.error("No URL provided to get presigned URL");
      return;
    }

    console.log(`getting presigned url for ${file.name}`);

    // Get the presigned URL
    const response = await axios({
      method: "GET",
      url,
      params: {
        fileName: encodeURIComponent(file.name),
      },
    });

    console.log("File to upload: ", file.name);

    const presignedUrl = response.data.presignedUrl;
    if (!presignedUrl) {
      console.error("No presigned URL returned from the server");
      return;
    }

    console.log("Uploading to: ", presignedUrl);

    const result = await fetch(presignedUrl, {
      method: "PUT",
      headers: {
        "Content-Length": file.size.toString(),
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    console.log("Result: ", result);

    setFile(undefined);
    if (result.ok) {
      invalidateAvailableProducts();
      console.log("File uploaded successfully");
    }
  };
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {!file ? (
        <input type="file" onChange={onFileChange} />
      ) : (
        <div>
          <button onClick={removeFile}>Remove file</button>
          <button onClick={uploadFile}>Upload file</button>
        </div>
      )}
    </Box>
  );
}
