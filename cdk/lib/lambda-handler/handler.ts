export async function main() {
  return {
    body: JSON.stringify({message: 'Hello from Lambda 🎉'}),
    statusCode: 200,
  };
}
