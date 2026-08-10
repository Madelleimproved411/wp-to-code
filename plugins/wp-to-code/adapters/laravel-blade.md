# Adapter: Laravel Blade

| | |
| --- | --- |
| Component file | `resources/views/components/sections/<name>.blade.php` |
| Page file | `resources/views/pages/<slug>.blade.php` |
| Class attribute | `class` |
| Global CSS | `resources/css/app.css` |
| Dev server | `php artisan serve`, usually `http://localhost:8000` |

## Component

Props are declared at the top and used as PHP variables. Anonymous components need no class.

```blade
@props(['sub' => null, 'title', 'pad' => 'py-[100px]', 'events' => []])

<section class="{{ $pad }}">
    <div class="mx-auto max-w-[1140px]">
        @if ($sub)
            <p class="text-13 leading-[15.6px] uppercase">{{ $sub }}</p>
        @endif
        <h2 class="text-50 leading-[60px]">{{ $title }}</h2>

        @foreach ($events as $event)
            <a href="{{ $event['href'] }}" class="block h-[558px]">{{ $event['title'] }}</a>
        @endforeach
    </div>
</section>
```

Used as:

```blade
<x-sections.event-list sub="Events" title="Upcoming Events" pad="pb-[100px]"
    :events="[['title' => 'City Run', 'href' => '/events/city-run']]" />
```

## Routing

```php
Route::view('/', 'pages.home');
Route::view('/about-us', 'pages.about-us');
```

## Notes

- `{{ }}` escapes. Use `{!! !!}` only for markup you control.
- Array props use `:events="[...]"`, string props use `events="..."`. Getting this wrong passes the literal string.
- Tailwind's scanner reads `.blade.php` files. Confirm `resources/views/**/*.blade.php` is in the content sources, or every class silently produces nothing.
- Never write `class="pl-[{{ $x }}px]"`. Use `style="padding-left: {{ $x }}px"`.
