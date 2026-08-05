import React from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import SidebarLayout from '../../navigation/SidebarLayout';
import Button from '../../components/Button';

export default function PrivacyPolicyScreen({ navigation }) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const lastUpdated = '31 de julio de 2026';
  const currentYear = new Date().getFullYear();

  const Section = ({ title, children }) => (
    <View style={[styles.section, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={[styles.sectionDivider, { backgroundColor: theme.accent }]} />
      {typeof children === 'string' ? (
        <Text style={[styles.sectionText, { color: theme.textSecondary }]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );

  const BulletItem = ({ children }) => (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, { backgroundColor: theme.accent }]} />
      <Text style={[styles.sectionText, { color: theme.textSecondary, flex: 1 }]}>{children}</Text>
    </View>
  );

  return (
    <SidebarLayout activeRoute="Settings" navigation={navigation}>
      <ScrollView contentContainerStyle={[styles.container, { padding: 10 }]}>
        <View style={styles.header}>
          <Button
            onPress={() => navigation.goBack()}
            variant="secondary"
            style={[styles.backCircleBtn, { paddingHorizontal: 0, shadowColor: theme.shadow, borderWidth: 0 }]}
            icon={<Ionicons name="chevron-back" size={22} color={theme.text} />}
          />
          <Text style={[styles.title, { color: theme.text }]}>Política de Privacidad</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Encabezado / Hero */}
        <View style={[styles.heroCard, { backgroundColor: theme.accent }]}>
          <Ionicons name="shield-checkmark" size={40} color="#FFF" />
          <Text style={styles.heroTitle}>Tu privacidad es nuestra prioridad</Text>
          <Text style={styles.heroSubtitle}>
            En UniControl tratamos tus datos con transparencia, seguridad y respeto.
          </Text>
        </View>

        <View style={[styles.metaCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
          <View style={styles.metaRow}>
            <Ionicons name="document-text-outline" size={18} color={theme.accent} />
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
              Última actualización: {lastUpdated}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="apps-outline" size={18} color={theme.accent} />
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
              Aplicación: UniControl
            </Text>
          </View>
        </View>

        <Section title="1. Introducción">
          Esta Política de Privacidad describe cómo UniControl ("la aplicación", "nosotros")
          recopila, utiliza, almacena y protege la información personal de los usuarios ("usted",
          "usuario"). Al utilizar la aplicación, usted acepta las prácticas descritas en este
          documento. Si no está de acuerdo con esta política, le recomendamos no utilizar la aplicación.
        </Section>

        <Section title="2. Información que Recopilamos">
          <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
            Para ofrecerle una experiencia completa y personalizada, recopilamos la siguiente información:
          </Text>
          <View style={{ height: 10 }} />
          <BulletItem><Text style={styles.bulletStrong}>Datos de Cuenta: </Text>nombre, nombre de usuario, correo electrónico y contraseña cifrada.</BulletItem>
          <BulletItem><Text style={styles.bulletStrong}>Datos de Uso: </Text>información sobre cómo interactúa con la aplicación (módulos utilizados, preferencias de configuración).</BulletItem>
          <BulletItem><Text style={styles.bulletStrong}>Datos de Suscripción: </Text>información sobre sus suscripciones, estados de prueba gratuita y fechas de vencimiento.</BulletItem>
          <BulletItem><Text style={styles.bulletStrong}>Datos de Dispositivo: </Text>tipo de dispositivo, sistema operativo y versión de la aplicación (con fines de compatibilidad y diagnóstico).</BulletItem>
        </Section>

        <Section title="3. Uso de la Información">
          <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
            La información recopilada se utiliza exclusivamente para:
          </Text>
          <View style={{ height: 10 }} />
          <BulletItem>Crear y gestionar su cuenta de usuario.</BulletItem>
          <BulletItem>Brindar acceso a los módulos y funcionalidades contratados.</BulletItem>
          <BulletItem>Gestionar suscripciones, renovaciones y periodos de prueba.</BulletItem>
          <BulletItem>Enviar notificaciones importantes sobre su cuenta (seguridad, vencimientos).</BulletItem>
          <BulletItem>Mejorar la estabilidad, el rendimiento y la experiencia general de la aplicación.</BulletItem>
          <BulletItem>Cumplir con obligaciones legales y regulatorias aplicables.</BulletItem>
        </Section>

        <Section title="4. Almacenamiento y Seguridad">
          <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
            Implementamos medidas técnicas y organizativas apropiadas para proteger su información
            contra acceso no autorizado, alteración, divulgación o destrucción, incluyendo:
          </Text>
          <View style={{ height: 10 }} />
          <BulletItem>Cifrado de contraseñas mediante algoritmos seguros (bcrypt).</BulletItem>
          <BulletItem>Transmisión de datos a través de conexiones seguras (HTTPS).</BulletItem>
          <BulletItem>Almacenamiento en servidores protegidos con acceso restringido.</BulletItem>
          <BulletItem>Mecanismos de sincronización offline que conservan sus cambios localmente y los suben de forma segura cuando hay conexión.</BulletItem>
        </Section>

        <Section title="5. Compartir Información con Terceros">
          <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
            No vendemos, alquilamos ni compartimos su información personal con terceros, salvo en
            los siguientes casos:
          </Text>
          <View style={{ height: 10 }} />
          <BulletItem>Proveedores de servicios técnicos (hosting, almacenamiento) que actúan en nuestro nombre y están obligados a proteger sus datos.</BulletItem>
          <BulletItem>Autoridades competentes cuando sea requerido por ley, orden judicial o proceso legal.</BulletItem>
          <BulletItem>Protección de derechos, seguridad o propiedad de la aplicación, sus usuarios o el público.</BulletItem>
        </Section>

        <Section title="6. Derechos del Usuario">
          <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
            De acuerdo con la normativa de protección de datos (Ley 1581 de 2012 en Colombia y el
            Reglamento General de Protección de Datos — RGPD en la Unión Europea, según aplique),
            usted tiene derecho a:
          </Text>
          <View style={{ height: 10 }} />
          <BulletItem><Text style={styles.bulletStrong}>Acceso: </Text>solicitar una copia de la información que tenemos sobre usted.</BulletItem>
          <BulletItem><Text style={styles.bulletStrong}>Rectificación: </Text>corregir datos inexactos o incompletos desde la sección "Editar Datos de Perfil".</BulletItem>
          <BulletItem><Text style={styles.bulletStrong}>Supresión: </Text>solicitar la eliminación de sus datos personales cuando ya no sean necesarios.</BulletItem>
          <BulletItem><Text style={styles.bulletStrong}>Portabilidad: </Text>recibir sus datos en un formato estructurado y de uso común.</BulletItem>
          <BulletItem><Text style={styles.bulletStrong}>Revocación: </Text>retirar su consentimiento para el tratamiento de datos en cualquier momento.</BulletItem>
        </Section>

        <Section title="7. Retención de Datos">
          <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
            Conservamos su información únicamente durante el tiempo necesario para cumplir con los
            fines descritos en esta política, o durante el periodo que exija la legislación vigente.
            Una vez eliminada su cuenta, los datos asociados se suprimen o anonimizan de forma segura.
          </Text>
        </Section>

        <Section title="8. Servicios de Terceros y Enlaces Externos">
          <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
            La aplicación puede contener enlaces a sitios web o servicios de terceros (por ejemplo,
            la versión web o descargas de APK). No somos responsables de las prácticas de privacidad
            de dichos terceros. Le recomendamos revisar sus políticas antes de proporcionar información.
          </Text>
        </Section>

        <Section title="9. Privacidad de Menores">
          <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
            La aplicación no está dirigida a menores de 13 años y no recopilamos de forma consciente
            información personal de menores. Si usted es padre, madre o tutor y descubre que su hijo
            nos ha proporcionado datos personales, contáctenos para que podamos eliminarlos
            inmediatamente.
          </Text>
        </Section>

        <Section title="10. Cambios en esta Política">
          <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
            Podemos actualizar esta Política de Privacidad periódicamente para reflejar cambios en
            nuestras prácticas o requisitos legales. Notificaremos los cambios significativos a
            través de la aplicación o por correo electrónico. La fecha de "Última actualización"
            al inicio de este documento indicará la versión vigente.
          </Text>
        </Section>

        <Section title="11. Contacto">
          <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
            Si tiene preguntas, inquietudes o solicitudes relacionadas con esta Política de
            Privacidad o el tratamiento de sus datos personales, puede contactarnos a través del
            Buzón de Sugerencias dentro de la aplicación o escribiendo al correo de soporte oficial.
          </Text>
        </Section>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={theme.accent} />
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            © {currentYear} UniControl. Todos los derechos reservados.
          </Text>
        </View>
      </ScrollView>
    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  heroCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  heroTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 10,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  metaCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  metaText: {
    fontSize: 12,
    flex: 1,
  },
  section: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  sectionDivider: {
    width: 40,
    height: 3,
    borderRadius: 2,
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 13,
    lineHeight: 20,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  bulletStrong: {
    fontWeight: '600',
    color: '#000',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
    borderTopWidth: 1,
    marginTop: 8,
  },
  footerText: {
    fontSize: 12,
  },
});