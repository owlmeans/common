import { describe, expect, test } from 'bun:test'
import { ImageKind, ImageRole, makePageModel, PageRegion } from '../src/index.js'
import { fixture } from './servers.js'

const images = (name: string, path: string) => makePageModel({ url: `https://acme.test${path}`, html: fixture(name) }).images()

describe('@owlmeans/llm-reader — pictures with their context', () => {
  const article = images('article.html', '/stories/tide-pools-winter')
  const find = (fragment: string) => article.find(image => image.url.includes(fragment))!

  test('the logo: in the header, linked home', () => {
    expect(find('logo.svg')).toMatchObject({ region: PageRegion.Header, hint: ImageRole.Logo, alt: 'Acme Journal', link: { url: 'https://acme.test/' } })
  })

  test('the hero: the widest srcset candidate, its caption and section, merged with the JSON-LD image', () => {
    const hero = find('tidepool-hero')
    expect(hero.url).toBe('https://acme.test/images/tidepool-hero-1600.jpg')
    expect(hero.candidates.filter(c => c.descriptor != null).map(c => c.descriptor)).toEqual(['800w', '1600w'])
    expect(hero).toMatchObject({
      region: PageRegion.Article, inMain: true, hint: ImageRole.Hero, width: 1600, height: 900,
      caption: 'Ice forms at the edge of a pool on the Norwegian coast.', section: 'How Tide Pools Survive Winter',
    })
    expect(hero.origins).toEqual(['dom', 'json-ld'])
  })

  test('an inline illustration knows the paragraph heading it illustrates and that it lazy-loads', () => {
    expect(find('periwinkle')).toMatchObject({ section: 'Antifreeze in the blood', loading: 'lazy', decorative: false })
  })

  test('thumbnails in a link list, a CSS background, an icon, a tracking pixel', () => {
    expect(find('thumbs/kelp')).toMatchObject({
      hint: ImageRole.Thumbnail, decorative: true, region: PageRegion.Aside, link: { text: 'Kelp forests are moving north' },
    })
    expect(find('waves-bg')).toMatchObject({ kind: ImageKind.Background, origins: ['css'] })
    expect(article.find(image => image.kind === ImageKind.Svg)).toMatchObject({ caption: 'Twitter', hint: ImageRole.Icon, region: PageRegion.Footer })
    expect(find('pixel.gif').hint).toBe(ImageRole.Tracking)
  })

  test('share images and icons are listed from the head', () => {
    expect(find('tidepool-share')).toMatchObject({ kind: ImageKind.Meta, origins: ['og:image'] })
    expect(find('favicon.ico').kind).toBe(ImageKind.Icon)
  })

  test('cards: each thumbnail belongs to its own card heading', () => {
    const topics = images('topics.html', '/topics')
    expect(topics.find(image => image.url.includes('climate'))).toMatchObject({ section: 'Climate', hint: ImageRole.Thumbnail })
    expect(images('landing.html', '/').find(image => image.url.includes('dana'))!.hint).toBe(ImageRole.Avatar)
  })
})
