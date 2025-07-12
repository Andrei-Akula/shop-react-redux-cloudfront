import { APIGatewayTokenAuthorizerEvent, Context } from 'aws-lambda';

function generatePolicy(principalId: string, effect: string, resource: string) {
  return {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };
}

export async function tokenAuthorizerHandler(event: APIGatewayTokenAuthorizerEvent, context: Context) {
  console.log('tokenAuthorizerHandler: event:', JSON.stringify(event, null, 2));

  // testing purpose
  const token = process.env.AUTHORIZATION_TOKEN;
  // Check if the request is authorized
  if (token && event.authorizationToken === token) {
    return generatePolicy("user", "Allow", event.methodArn);
  } else {
    return generatePolicy("user", "Deny", event.methodArn);
  } 
}