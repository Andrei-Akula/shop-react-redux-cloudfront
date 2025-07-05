interface LambdaEvent {
  message: string;
}

interface LambdaResponse {
  message: string;
}

export async function main(event: LambdaEvent): Promise<LambdaResponse> {
  return {
    message: `SUCCESS with message ${event.message} 🎉`,
  };
}
