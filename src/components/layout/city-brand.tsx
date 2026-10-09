import Image from 'next/image';

export default function CityBrand({ large = false }: { large?: boolean }) {
  return <Image src="/city-ofertas.png" width={640} height={361}
    alt="City Ofertas Importadora" preload sizes={large ? '224px' : '96px'}
    className={large ? 'w-56 h-auto' : 'w-24 h-auto'} />;
}
