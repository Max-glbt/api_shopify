import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

interface RequestWithRawBody extends Request {
  rawBody?: string;
}

export const verifyShopifyWebhook = (
  req: RequestWithRawBody,
  res: Response,
  next: NextFunction
): void => {
  // Verification HMAC si tout est valide
  try {
    // 1. Récupérer le header HMAC envoyé par Shopify puis Vérifier que le header existe
    const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string;
    if (!hmacHeader) {
      res.status(401).json({
        error: '[HMAC] Unauthorized',
        message: 'Missing HMAC signature'
      });
      return;
    }

    // 2. Recuperer le secret shipify puis verifier qu'il est bien configuré
    const shopifySecret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!shopifySecret) {
      console.error('[HMAC] Shopify secret non configuré');
      res.status(500).json({
        error: 'Server configuration error'
      });
      return;
    }

    // 3. Récupérer le raw body puis verifier qu'il est présent
    const rawBody = req.rawBody;
    if (!rawBody) {
      console.error('[HMAC] Raw body manquant pour la vérification');
      res.status(500).json({
        error: 'Server configuration error',
        message: 'Raw body missing for HMAC verification'
      });
      return;
    }

    // 4. Crée notre propre HMAC
    const generatedHash = crypto
      .createHmac('sha256', shopifySecret)
      .update(rawBody, 'utf8')
      .digest('base64');

    // 5. Comparaison sécurisée des deux HMAC puis verification de la validité
    const isValid = crypto.timingSafeEqual(
      Buffer.from(hmacHeader),
      Buffer.from(generatedHash)
    );
    if (!isValid) {
      console.error('[HMAC] Signature invalide');
      console.debug(
        `[HMAC] Reçu: ${hmacHeader} et hash calculé: ${generatedHash}`
      );

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid HMAC signature'
      });
      return;
    }

    // 6. Signature valide et verification réussie
    console.log('[HMAC] Webhook vérifié avec succès');
    next();
  } catch (error) {
    console.error('[HMAC] Erreur lors de la vérification:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
};